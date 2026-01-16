import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { db, initializeDatabase, sqlite } from "./db/index.js";
import {
    Scraper,
    getConversationForAnalysis,
    getUnanalyzedConversations,
} from "./services/scraper.js";

// Load .env from parent directory
const envFile = Bun.file("../.env");
if (await envFile.exists()) {
    const envContent = await envFile.text();
    for (const line of envContent.split("\n")) {
        const [key, ...valueParts] = line.split("=");
        if (key && valueParts.length) {
            const value = valueParts
                .join("=")
                .trim()
                .replace(/^["']|["']$/g, "");
            process.env[key.trim()] = value;
        }
    }
}

// Initialize database on startup
await initializeDatabase();

const app = new Elysia()
    .use(cors())
    .get("/", () => ({ message: "Customer Service QA API", version: "1.0.0" }))

    // ==================== SCRAPER ENDPOINTS ====================

    // Start a new scraping job
    .post(
        "/api/scraper/run",
        async (ctx) => {
            const { fromDate, toDate } = ctx.body as { fromDate: string; toDate: string };

            const PAGE_ID = process.env.PAGE_ID;
            const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

            if (!PAGE_ID || !PAGE_ACCESS_TOKEN) {
                return { success: false, error: "Missing PAGE_ID or PAGE_ACCESS_TOKEN" };
            }

            const scraper = new Scraper({
                pageId: PAGE_ID,
                pageAccessToken: PAGE_ACCESS_TOKEN,
                fromDate,
                toDate,
            });

            // Run in background
            scraper.scrape().catch(console.error);

            return { success: true, message: "Scraping job started" };
        },
        {
            body: t.Object({
                fromDate: t.String(),
                toDate: t.String(),
            }),
        }
    )

    // Get scraper run history
    .get("/api/scraper/runs", () => {
        const runs = sqlite
            .query("SELECT * FROM scraper_runs ORDER BY started_at DESC LIMIT 50")
            .all();
        return { success: true, runs };
    })

    // ==================== CONVERSATIONS ENDPOINTS ====================

    // Get conversations list
    .get("/api/conversations", ({ query }) => {
        const limit = parseInt(query.limit || "50");
        const offset = parseInt(query.offset || "0");
        const fromDate = query.fromDate;
        const toDate = query.toDate;

        let sql = "SELECT * FROM conversations WHERE 1=1";
        if (fromDate) sql += ` AND inserted_at >= '${fromDate}'`;
        if (toDate) sql += ` AND inserted_at <= '${toDate}'`;
        sql += ` ORDER BY inserted_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const conversations = sqlite.query(sql).all();
        const total = sqlite.query("SELECT COUNT(*) as count FROM conversations").get() as {
            count: number;
        };

        return { success: true, conversations, total: total.count };
    })

    // Get single conversation with messages
    .get("/api/conversations/:id", ({ params }) => {
        const data = getConversationForAnalysis(params.id);
        if (!data) {
            return { success: false, error: "Conversation not found" };
        }
        return { success: true, ...data };
    })

    // Get unanalyzed conversations
    .get("/api/conversations/unanalyzed", () => {
        const ids = getUnanalyzedConversations();
        return { success: true, conversationIds: ids, count: ids.length };
    })

    // ==================== TICKETS ENDPOINTS ====================

    // Get tickets list
    .get("/api/tickets", ({ query }) => {
        const limit = parseInt(query.limit || "50");
        const offset = parseInt(query.offset || "0");
        const conversationId = query.conversationId;

        let sql = `
            SELECT t.*, c.customer_name, c.snippet as conversation_snippet
            FROM tickets t
            LEFT JOIN conversations c ON t.conversation_id = c.id
            WHERE 1=1
        `;
        if (conversationId) sql += ` AND t.conversation_id = '${conversationId}'`;
        sql += ` ORDER BY t.started_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const tickets = sqlite.query(sql).all();
        const total = sqlite.query("SELECT COUNT(*) as count FROM tickets").get() as {
            count: number;
        };

        return { success: true, tickets, total: total.count };
    })

    // Get single ticket with messages in range
    .get("/api/tickets/:id", ({ params }) => {
        const ticket = sqlite
            .query("SELECT * FROM tickets WHERE id = ?")
            .get(parseInt(params.id)) as any;

        if (!ticket) {
            return { success: false, error: "Ticket not found" };
        }

        // Get messages in the ticket range
        const messages = sqlite
            .query(
                `
                SELECT * FROM messages
                WHERE conversation_id = ?
                AND inserted_at >= ? AND inserted_at <= ?
                ORDER BY inserted_at ASC
            `
            )
            .all(ticket.conversation_id, ticket.started_at, ticket.ended_at);

        return { success: true, ticket, messages };
    })

    // ==================== RISK FLAGS ENDPOINTS ====================

    // Get risk flags
    .get("/api/risks", ({ query }) => {
        const limit = parseInt(query.limit || "50");
        const type = query.type; // non_compliant, incorrect_info, unprofessional, missed_opportunity

        let sql = `
            SELECT rf.*, m.content as message_content, c.customer_name
            FROM risk_flags rf
            LEFT JOIN messages m ON rf.message_id = m.id
            LEFT JOIN conversations c ON m.conversation_id = c.id
            WHERE 1=1
        `;
        if (type) sql += ` AND rf.risk_type = '${type}'`;
        sql += ` ORDER BY rf.id DESC LIMIT ${limit}`;

        const risks = sqlite.query(sql).all();
        return { success: true, risks };
    })

    // ==================== ANALYTICS ENDPOINTS ====================

    // Get dashboard summary
    .get("/api/analytics/dashboard", () => {
        const totalConversations = sqlite
            .query("SELECT COUNT(*) as count FROM conversations")
            .get() as { count: number };

        const totalMessages = sqlite.query("SELECT COUNT(*) as count FROM messages").get() as {
            count: number;
        };

        const totalTickets = sqlite.query("SELECT COUNT(*) as count FROM tickets").get() as {
            count: number;
        };

        const totalRiskFlags = sqlite.query("SELECT COUNT(*) as count FROM risk_flags").get() as {
            count: number;
        };

        // Risk flags by type
        const riskFlagsByType = sqlite
            .query(
                `
                SELECT risk_type, COUNT(*) as count
                FROM risk_flags
                GROUP BY risk_type
            `
            )
            .all() as { risk_type: string; count: number }[];

        const messagesWithRiskFlags = sqlite
            .query("SELECT COUNT(*) as count FROM messages WHERE has_risk_flag = 1")
            .get() as { count: number };

        const autoReplies = sqlite
            .query("SELECT COUNT(*) as count FROM messages WHERE is_auto_reply = 1")
            .get() as { count: number };

        // Sentiment distribution
        const sentimentDistribution = sqlite
            .query(
                `
                SELECT sentiment, COUNT(*) as count
                FROM tickets
                WHERE sentiment IS NOT NULL
                GROUP BY sentiment
            `
            )
            .all() as { sentiment: string; count: number }[];

        // Recent activity (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const recentConversations = sqlite
            .query(
                `SELECT COUNT(*) as count FROM conversations WHERE scraped_at >= '${sevenDaysAgo}'`
            )
            .get() as { count: number };

        return {
            success: true,
            dashboard: {
                totalConversations: totalConversations.count,
                totalMessages: totalMessages.count,
                totalTickets: totalTickets.count,
                totalRiskFlags: totalRiskFlags.count,
                riskFlagsByType,
                messagesWithRiskFlags: messagesWithRiskFlags.count,
                autoReplies: autoReplies.count,
                sentimentDistribution,
                recentConversations: recentConversations.count,
            },
        };
    })

    // Get staff metrics (based on tickets assigned)
    .get("/api/analytics/staff", () => {
        const staffMetrics = sqlite
            .query(
                `
                SELECT
                    s.id, s.name,
                    COUNT(DISTINCT t.id) as total_tickets,
                    AVG(CASE WHEN t.sentiment = 'positive' THEN 1
                             WHEN t.sentiment = 'neutral' THEN 0
                             WHEN t.sentiment = 'negative' THEN -1 END) as avg_sentiment_score
                FROM staff s
                LEFT JOIN tickets t ON s.id = t.staff_id
                GROUP BY s.id
                ORDER BY total_tickets DESC
            `
            )
            .all();

        return { success: true, staffMetrics };
    })

    // ==================== DASHBOARD API ENDPOINTS ====================

    // Dashboard stats (for Vue frontend)
    .get("/api/dashboard/stats", () => {
        const totalTickets = sqlite.query("SELECT COUNT(*) as count FROM tickets").get() as {
            count: number;
        };
        const resolvedTickets = sqlite
            .query("SELECT COUNT(*) as count FROM tickets WHERE is_resolved = 1")
            .get() as { count: number };
        const riskFlagCount = sqlite.query("SELECT COUNT(*) as count FROM risk_flags").get() as {
            count: number;
        };
        const staffCount = sqlite.query("SELECT COUNT(*) as count FROM staff").get() as {
            count: number;
        };

        const sentimentCounts = sqlite
            .query(
                `
            SELECT sentiment, COUNT(*) as count
            FROM tickets
            WHERE sentiment IS NOT NULL
            GROUP BY sentiment
        `
            )
            .all() as { sentiment: string; count: number }[];

        const sentimentBreakdown = {
            positive: sentimentCounts.find((s) => s.sentiment === "positive")?.count || 0,
            neutral: sentimentCounts.find((s) => s.sentiment === "neutral")?.count || 0,
            negative: sentimentCounts.find((s) => s.sentiment === "negative")?.count || 0,
        };

        return {
            totalTickets: totalTickets.count,
            resolvedTickets: resolvedTickets.count,
            resolutionRate:
                totalTickets.count > 0
                    ? Math.round((resolvedTickets.count / totalTickets.count) * 100)
                    : 0,
            sentimentBreakdown,
            riskFlagCount: riskFlagCount.count,
            staffCount: staffCount.count,
        };
    })

    // Sentiment trend over time
    .get("/api/dashboard/sentiment-trend", ({ query }) => {
        const period = query.period || "week";
        let dateFormat: string;
        let daysBack: number;

        switch (period) {
            case "day":
                dateFormat = "%Y-%m-%d %H:00";
                daysBack = 1;
                break;
            case "month":
                dateFormat = "%Y-%m-%d";
                daysBack = 30;
                break;
            default: // week
                dateFormat = "%Y-%m-%d";
                daysBack = 7;
        }

        const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

        const trends = sqlite
            .query(
                `
            SELECT
                strftime('${dateFormat}', started_at) as period,
                SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive,
                SUM(CASE WHEN sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral,
                SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative,
                COUNT(*) as total
            FROM tickets
            WHERE started_at >= '${startDate}'
            GROUP BY period
            ORDER BY period ASC
        `
            )
            .all() as {
            period: string;
            positive: number;
            neutral: number;
            negative: number;
            total: number;
        }[];

        return trends;
    })

    // Staff performance for dashboard
    .get("/api/dashboard/staff-performance", () => {
        const staffPerformance = sqlite
            .query(
                `
            SELECT
                s.id as staff_id,
                s.name as staff_name,
                COUNT(DISTINCT t.id) as total_tickets,
                SUM(CASE WHEN t.is_resolved = 1 THEN 1 ELSE 0 END) as resolved_tickets,
                ROUND(AVG(CASE WHEN t.sentiment = 'positive' THEN 1
                              WHEN t.sentiment = 'neutral' THEN 0
                              WHEN t.sentiment = 'negative' THEN -1 END), 2) as avg_sentiment_score,
                (SELECT COUNT(*) FROM risk_flags rf
                 JOIN messages m ON rf.message_id = m.id
                 JOIN tickets t2 ON m.conversation_id = t2.conversation_id
                 WHERE t2.staff_id = s.id) as risk_flags,
                SUM(CASE WHEN t.staff_quality = 'excellent' THEN 1 ELSE 0 END) as quality_excellent,
                SUM(CASE WHEN t.staff_quality = 'good' THEN 1 ELSE 0 END) as quality_good,
                SUM(CASE WHEN t.staff_quality = 'average' THEN 1 ELSE 0 END) as quality_average,
                SUM(CASE WHEN t.staff_quality = 'poor' THEN 1 ELSE 0 END) as quality_poor
            FROM staff s
            LEFT JOIN tickets t ON s.id = t.staff_id
            GROUP BY s.id
            ORDER BY total_tickets DESC
        `
            )
            .all() as any[];

        return staffPerformance.map((sp) => ({
            staff_id: sp.staff_id,
            staff_name: sp.staff_name,
            total_tickets: sp.total_tickets,
            resolved_tickets: sp.resolved_tickets,
            resolution_rate:
                sp.total_tickets > 0
                    ? Math.round((sp.resolved_tickets / sp.total_tickets) * 100)
                    : 0,
            avg_sentiment_score: sp.avg_sentiment_score || 0,
            risk_flags: sp.risk_flags || 0,
            quality_breakdown: {
                excellent: sp.quality_excellent || 0,
                good: sp.quality_good || 0,
                average: sp.quality_average || 0,
                poor: sp.quality_poor || 0,
            },
        }));
    })

    // Risk flags by type
    .get("/api/dashboard/risk-flags-by-type", () => {
        const risksByType = sqlite
            .query(
                `
            SELECT risk_type, COUNT(*) as count
            FROM risk_flags
            GROUP BY risk_type
        `
            )
            .all() as { risk_type: string; count: number }[];

        const result: Record<string, number> = {};
        risksByType.forEach((r) => {
            result[r.risk_type] = r.count;
        });

        return result;
    })

    // Risk flags list
    .get("/api/risk-flags", () => {
        const riskFlags = sqlite
            .query(
                `
            SELECT rf.*, m.content as message_content, c.customer_name
            FROM risk_flags rf
            LEFT JOIN messages m ON rf.message_id = m.id
            LEFT JOIN conversations c ON m.conversation_id = c.id
            ORDER BY rf.id DESC
        `
            )
            .all();
        return riskFlags;
    })

    // Tag analytics (for bubble chart)
    .get("/api/dashboard/tag-analytics", () => {
        const tagAnalytics = sqlite
            .query(
                `
            SELECT
                t.id as tag_id,
                t.name as tag_name,
                COUNT(DISTINCT ct.conversation_id) as count,
                AVG(CASE
                    WHEN tk.sentiment = 'positive' THEN 1
                    WHEN tk.sentiment = 'neutral' THEN 0.5
                    WHEN tk.sentiment = 'negative' THEN 0
                    ELSE 0.5
                END) as avg_sentiment
            FROM tags t
            LEFT JOIN conversation_tags ct ON t.id = ct.tag_id
            LEFT JOIN tickets tk ON ct.conversation_id = tk.conversation_id
            GROUP BY t.id
            HAVING count > 0
            ORDER BY count DESC
        `
            )
            .all();
        return tagAnalytics;
    })

    // Staff risk heatmap
    .get("/api/dashboard/staff-risk-heatmap", () => {
        const staffRisks = sqlite
            .query(
                `
            SELECT
                s.id as staff_id,
                s.name as staff_name,
                rf.risk_type,
                COUNT(rf.id) as count
            FROM staff s
            LEFT JOIN tickets t ON s.id = t.staff_id
            LEFT JOIN risk_flags rf ON t.id = rf.ticket_id
            WHERE rf.risk_type IS NOT NULL
            GROUP BY s.id, rf.risk_type
            ORDER BY s.name
        `
            )
            .all() as { staff_id: string; staff_name: string; risk_type: string; count: number }[];

        // Group by staff
        const staffMap = new Map<
            string,
            { staff_id: string; staff_name: string; risks: Record<string, number> }
        >();

        for (const row of staffRisks) {
            if (!staffMap.has(row.staff_id)) {
                staffMap.set(row.staff_id, {
                    staff_id: row.staff_id,
                    staff_name: row.staff_name,
                    risks: {
                        non_compliant: 0,
                        incorrect_info: 0,
                        unprofessional: 0,
                        missed_opportunity: 0,
                    },
                });
            }
            staffMap.get(row.staff_id)!.risks[row.risk_type] = row.count;
        }

        return Array.from(staffMap.values());
    })

    // Staff attitude breakdown (for radar chart)
    .get("/api/dashboard/staff-attitude-breakdown", () => {
        // Current period (this month)
        const now = new Date();
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

        const thisMonth = sqlite
            .query(
                `
            SELECT staff_attitude, COUNT(*) as count
            FROM tickets
            WHERE started_at >= '${thisMonthStart}'
            GROUP BY staff_attitude
        `
            )
            .all() as { staff_attitude: string; count: number }[];

        const lastMonth = sqlite
            .query(
                `
            SELECT staff_attitude, COUNT(*) as count
            FROM tickets
            WHERE started_at >= '${lastMonthStart}' AND started_at < '${thisMonthStart}'
            GROUP BY staff_attitude
        `
            )
            .all() as { staff_attitude: string; count: number }[];

        const attitudes = ["enthusiastic", "professional", "mechanical", "pushy", "rude"];

        const result: Record<string, Record<string, number>> = {
            thisMonth: {},
            lastMonth: {},
        };

        for (const att of attitudes) {
            result.thisMonth[att] = thisMonth.find((a) => a.staff_attitude === att)?.count || 0;
            result.lastMonth[att] = lastMonth.find((a) => a.staff_attitude === att)?.count || 0;
        }

        return result;
    })

    // ==================== LLM ANALYSIS ENDPOINTS ====================

    // Trigger LLM analysis (calls Python service)
    .post("/api/llm/analyze", async ({ body }) => {
        const { conversationIds } = body as { conversationIds?: string[] };

        const idsToAnalyze = conversationIds || getUnanalyzedConversations();

        if (idsToAnalyze.length === 0) {
            return { success: true, message: "No conversations to analyze" };
        }

        // Call Python LLM service
        try {
            const response = await fetch("http://localhost:8000/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversation_ids: idsToAnalyze }),
            });

            if (!response.ok) {
                throw new Error(`LLM service error: ${response.status}`);
            }

            const result = await response.json();
            return { success: true, ...result };
        } catch (error) {
            return {
                success: false,
                error: `Failed to call LLM service: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            };
        }
    })

    // Get LLM analysis runs
    .get("/api/llm/runs", () => {
        const runs = sqlite
            .query("SELECT * FROM llm_analysis_runs ORDER BY started_at DESC LIMIT 50")
            .all();
        return { success: true, runs };
    })

    // ==================== TAGS & STAFF MANAGEMENT ====================

    // Get all tags
    .get("/api/tags", () => {
        const tags = sqlite.query("SELECT * FROM tags ORDER BY category, name").all();
        return { success: true, tags };
    })

    // Get all staff
    .get("/api/staff", () => {
        const staff = sqlite.query("SELECT * FROM staff ORDER BY name").all();
        return { success: true, staff };
    })

    // Add staff member
    .post(
        "/api/staff",
        async ({ body }) => {
            const { id, name } = body as { id: string; name: string };
            sqlite.exec(`
                INSERT OR REPLACE INTO staff (id, name, created_at)
                VALUES ('${id}', '${name}', '${new Date().toISOString()}')
            `);
            return { success: true, message: "Staff added" };
        },
        {
            body: t.Object({
                id: t.String(),
                name: t.String(),
            }),
        }
    )

    .listen(3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
