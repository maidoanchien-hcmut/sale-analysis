// Load shared root .env (monorepo)
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { db } from "./db";
import { conversations, messages } from "./schema_operational";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";

// env config
const PAGE_ID = process.env.PAGE_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

if (!PAGE_ID || !ACCESS_TOKEN) {
    console.error("Error: PAGE_ID or ACCESS_TOKEN is missing from the shared .env file.");
    process.exit(1);
}

const HEADERS = {
    authority: "pancake.vn",
    accept: "application/json, text/plain, */*",
    "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    cookie: `jwt=${ACCESS_TOKEN}`,
    referer: `https://pancake.vn/${PAGE_ID}`,
    origin: "https://pancake.vn",
};

// type def
interface PCMessage {
    id: string;
    message: string;
    inserted_at: string;
    from: {
        id: string;
        name: string;
        admin_id?: string;
    };
    [key: string]: any;
}

interface PCConversation {
    id: string;
    snippet?: string;
    updated_at: string;
    message_count: number;
    customers?: Array<{
        id: string;
        name: string;
    }>;
    last_sent_by?: {
        id: string;
        name: string;
    };
    [key: string]: any;
}

interface ConversationResponse {
    conversations: PCConversation[];
    success?: boolean;
}

interface MessageResponse {
    messages: PCMessage[];
}

// api calls
async function fetchConversationsAPI(limit = 100): Promise<PCConversation[]> {
    console.log(`Fetching latest ${limit} conversations...`);

    const url = `https://pancake.vn/api/v1/pages/${PAGE_ID}/conversations?unread_first=false&mode=NONE&tags=%22ALL%22&except_tags=[]&access_token=${ACCESS_TOKEN}&cursor_mode=true&from_platform=web&page_number=1&page_size=${limit}`;

    try {
        const response = await fetch(url, { headers: HEADERS });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);

        const data = (await response.json()) as ConversationResponse;
        return data.conversations || [];
    } catch (error) {
        console.error("Error fetching conversations:", error);
        return [];
    }
}

// Mimic Pancake frontend behaviour: initial load, then follow-up calls with current_count
async function fetchMessagesAPI(conversationId: string): Promise<PCMessage[]> {
    const allMessages: PCMessage[] = [];
    const fakeCustomerId = randomUUID();

    // First call: full query like the browser (user_view + is_new_api + separate_pos)
    const firstUrl =
        `https://pancake.vn/api/v1/pages/${PAGE_ID}/conversations/${conversationId}/messages` +
        `?customer_id=${fakeCustomerId}` +
        `&access_token=${ACCESS_TOKEN}` +
        `&user_view=true&is_new_api=true&separate_pos=true`;

    try {
        let response = await fetch(firstUrl, { headers: HEADERS });
        if (!response.ok) {
            console.warn(
                `Cannot fetch initial messages for ${conversationId}: HTTP ${response.status}`
            );
            return [];
        }

        let data = (await response.json()) as MessageResponse;
        let batch = data.messages || [];
        if (!batch.length) return [];

        allMessages.push(...batch);

        // Subsequent calls: exactly like browser, only current_count, customer_id, access_token, is_new_api=true
        // Pattern: 25 -> 55 -> 85 -> ... (step 30)
        let currentCount = allMessages.length; // expected 25 from first call
        const STEP = 30;

        while (true) {
            const nextCount = currentCount + STEP;

            const url =
                `https://pancake.vn/api/v1/pages/${PAGE_ID}/conversations/${conversationId}/messages` +
                `?current_count=${nextCount}` +
                `&customer_id=${fakeCustomerId}` +
                `&access_token=${ACCESS_TOKEN}` +
                `&is_new_api=true`;

            response = await fetch(url, { headers: HEADERS });
            if (!response.ok) {
                console.warn(
                    `Cannot fetch messages for ${conversationId} (current_count=${nextCount}): HTTP ${response.status}`
                );
                break;
            }

            data = (await response.json()) as MessageResponse;
            batch = data.messages || [];
            if (!batch.length) break;

            const beforeSize = allMessages.length;
            for (const msg of batch) {
                if (!allMessages.find((m) => m.id === msg.id)) {
                    allMessages.push(msg);
                }
            }

            if (allMessages.length === beforeSize) break; // nothing new, stop

            currentCount = allMessages.length;
            await sleep(150);
        }
    } catch (error) {
        console.error(`Error fetching messages for ${conversationId}:`, error);
    }

    return allMessages;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// main
export async function runScraper() {
    console.log("Starting scraper...");

    // Fetch Conversations
    const rawConvs = await fetchConversationsAPI(100);
    console.log(`Fetched ${rawConvs.length} conversations`);

    if (!rawConvs.length) {
        console.log("No conversations returned from API. Exiting.");
        return;
    }

    let processedCount = 0;

    for (const conv of rawConvs) {
        processedCount++;
        const customerName = conv.customers?.[0]?.name || "Unknown";

        // Fetch & Upsert Messages (small delay to be nice to the API)
        await sleep(200);
        const rawMsgs = await fetchMessagesAPI(conv.id);

        if (rawMsgs.length > 0) {
            const msgsToInsert = rawMsgs.map((msg) => ({
                id: msg.id,
                conversationId: conv.id,
                senderId: msg.from?.id || "unknown",
                senderName: msg.from?.name || "Unknown",
                content: msg.message || "",
                insertedAt: msg.inserted_at,
                isFromShop: Boolean(msg.from?.admin_id || msg.from?.id === PAGE_ID),
                fullJson: JSON.stringify(msg),
            }));

            await db.insert(messages).values(msgsToInsert).onConflictDoNothing();
        }

        // Use LOCAL count, not conv.message_count
        const localMsgCount = rawMsgs.length;

        await db
            .insert(conversations)
            .values({
                id: conv.id,
                pageId: PAGE_ID!,
                customerName,
                snippet: conv.snippet || "",
                updatedAt: conv.updated_at,
                messageCountTotal: localMsgCount,
                fullJson: JSON.stringify(conv),
            })
            .onConflictDoUpdate({
                target: conversations.id,
                set: {
                    snippet: sql`excluded.snippet`,
                    updatedAt: sql`excluded.updated_at`,
                    messageCountTotal: sql`excluded.message_count_total`,
                    fullJson: sql`excluded.full_json`,
                },
            });

        const status = `[${processedCount}/${rawConvs.length}] Synced: ${customerName} (${localMsgCount} msgs)`;
        process.stdout.write(`\r${status.padEnd(80, " ")}`);
    }
    console.log("\nScraper finished.");
}
