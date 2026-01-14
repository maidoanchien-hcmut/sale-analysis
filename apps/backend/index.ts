// Load shared root .env (monorepo)
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { Elysia } from "elysia";
import { runScraper } from "./src/scraper";
import { db } from "./src/db";
import { conversations, messages, dimPlatformTags } from "./src/schema_operational";
import { factChatAudit } from "./src/schema_warehouse";
import { sql, eq, asc } from "drizzle-orm";

const app = new Elysia();
const PYTHON_API = process.env.PYTHON_API ?? "http://localhost:8000/analyze";
const ANALYSIS_THRESHOLD = Number(process.env.ANALYSIS_THRESHOLD ?? 25);
const SKIP_SCRAPER = (process.env.SKIP_SCRAPER ?? "").toLowerCase() === "1";
const DRY_RUN = (process.env.DRY_RUN ?? "").toLowerCase() === "1";

async function getTranscriptDelta(convId: string, lastMsgId: string | null) {
    const allMsgs = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, convId))
        .orderBy(asc(messages.insertedAt));

    if (allMsgs.length === 0) return null;

    let deltaMsgs = allMsgs;

    if (lastMsgId) {
        const lastIndex = allMsgs.findIndex((m) => m.id === lastMsgId);
        if (lastIndex !== -1 && lastIndex < allMsgs.length - 1) {
            deltaMsgs = allMsgs.slice(lastIndex + 1);
        } else if (lastIndex === allMsgs.length - 1) {
            return null;
        }
    }

    const transcript = deltaMsgs
        .map((m) => `[${m.insertedAt}] ${m.senderName}: ${m.content}`)
        .join("\n");

    return {
        text: transcript,
        lastId: deltaMsgs.at(-1)!.id,
    };
}

app.post("/pipeline/run", async () => {
    console.log("Triggering Pipeline...");

    if (!SKIP_SCRAPER) {
        await runScraper();
    } else {
        console.log("Skipping scraper (SKIP_SCRAPER=1)");
    }

    const availableTags = await db
        .select({ id: dimPlatformTags.id, name: dimPlatformTags.name })
        .from(dimPlatformTags);

    // Only analyze conversations that have accumulated enough NEW messages since last analysis
    const candidates = await db
        .select()
        .from(conversations)
        .where(
            sql`${conversations.messageCountTotal} - ${conversations.lastAnalyzedMessageCount} >= ${ANALYSIS_THRESHOLD}`
        );

    console.log(
        `Found ${candidates.length} conversations to analyze (threshold=${ANALYSIS_THRESHOLD}).`
    );

    for (const conv of candidates) {
        const delta = await getTranscriptDelta(conv.id, conv.lastAnalyzedMessageId);

        if (!delta) {
            await db
                .update(conversations)
                .set({ lastAnalyzedMessageCount: conv.messageCountTotal })
                .where(eq(conversations.id, conv.id));
            continue;
        }

        try {
            console.log(`Analyzing ${conv.id}...`);

            if (DRY_RUN) {
                console.log(`DRY_RUN=1, not calling LLM and not writing results for ${conv.id}.`);
                continue;
            }

            const response = await fetch(PYTHON_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    transcript_delta: delta.text,
                    previous_summary: conv.contextSummary || "",
                    available_tags: availableTags,
                }),
            });

            if (!response.ok) throw new Error("Python API Failed");
            const result = (await response.json()) as any;

            await db
                .insert(factChatAudit)
                .values({
                    conversationId: conv.id,
                    primaryStaffId: "unknown",
                    sentimentLabel: result.sentiment_label,
                    riskLevel: result.risk_level,
                    repQualityLabel: result.rep_quality,
                    userIntent: result.user_intent,
                    auditEvidenceJson: JSON.stringify(result.audit_evidence),
                    competitorsMentioned: "[]",
                    updatedAt: new Date().toISOString(),
                })
                .onConflictDoUpdate({
                    target: factChatAudit.conversationId,
                    set: {
                        sentimentLabel: sql`excluded.sentiment_label`,
                        riskLevel: sql`excluded.risk_level`,
                        auditEvidenceJson: sql`excluded.audit_evidence_json`,
                        updatedAt: sql`excluded.updated_at`,
                    },
                });

            await db
                .update(conversations)
                .set({
                    lastAnalyzedAt: new Date().toISOString(),
                    lastAnalyzedMessageCount: conv.messageCountTotal,
                    lastAnalyzedMessageId: delta.lastId,
                    contextSummary: result.new_summary,
                })
                .where(eq(conversations.id, conv.id));

            console.log(`Analyzed ${conv.id}: ${result.sentiment_label}`);
        } catch (error) {
            console.error(`Failed to analyze ${conv.id}:`, error);
        }
    }

    return { status: "Success", processed: candidates.length };
});

app.listen(Number(process.env.BACKEND_PORT ?? 3000));
console.log(`Backend is running at ${app.server?.hostname}:${app.server?.port}`);
