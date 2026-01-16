import { sqlite } from "../db/index.js";
import type {
    ApiConversation,
    ApiConversationDetail,
    ApiMessage,
    ScraperConfig,
} from "../types/api.js";

const BASE_URL = "https://pages.fm/api/public_api";

interface ConversationsResponse {
    success: boolean;
    conversations: ApiConversation[];
}

interface MessagesResponse extends ApiConversationDetail {
    success: boolean;
}

export class Scraper {
    private config: ScraperConfig;
    private scraperRunId: number | null = null;
    private conversationsScraped = 0;
    private messagesScraped = 0;

    constructor(config: ScraperConfig) {
        this.config = config;
    }

    async scrape(): Promise<{ conversationsScraped: number; messagesScraped: number }> {
        console.log(`Starting scraper from ${this.config.fromDate} to ${this.config.toDate}`);

        this.scraperRunId = this.createScraperRun();

        try {
            const conversations = await this.fetchAllConversations();
            console.log(`Found ${conversations.length} conversations in date range`);

            for (const conv of conversations) {
                await this.processConversation(conv);
                this.conversationsScraped++;

                // Progress logging every 10 conversations
                if (this.conversationsScraped % 10 === 0) {
                    console.log(
                        `Progress: ${this.conversationsScraped}/${conversations.length} conversations, ${this.messagesScraped} messages`
                    );
                }

                await this.delay(500);
            }

            this.completeScraperRun();

            console.log(`\n✅ Scraping completed!`);
            console.log(`   Conversations saved: ${this.conversationsScraped}`);
            console.log(`   Messages saved: ${this.messagesScraped}`);

            return {
                conversationsScraped: this.conversationsScraped,
                messagesScraped: this.messagesScraped,
            };
        } catch (error) {
            this.failScraperRun(error instanceof Error ? error.message : "Unknown error");
            throw error;
        }
    }

    private async fetchAllConversations(): Promise<ApiConversation[]> {
        const allConversations: ApiConversation[] = [];
        let lastConversationId: string | null = null;
        let hasMore = true;
        const MVP_LIMIT = 100; // MVP: Stop fetching after 100 conversations in date range

        while (hasMore) {
            const url = new URL(`${BASE_URL}/v2/pages/${this.config.pageId}/conversations`);
            url.searchParams.set("page_access_token", this.config.pageAccessToken);
            if (lastConversationId) {
                url.searchParams.set("last_conversation_id", lastConversationId);
            }

            console.log(
                `Fetching conversations${
                    lastConversationId ? ` after ${lastConversationId}` : ""
                }... (have ${allConversations.length} so far)`
            );

            const response = await fetch(url.toString(), {
                headers: { Accept: "application/json" },
            });

            if (!response.ok) {
                throw new Error(
                    `Failed to fetch conversations: ${response.status} ${response.statusText}`
                );
            }

            const data: ConversationsResponse = await response.json();

            if (!data.success) {
                console.error("API Response:", JSON.stringify(data, null, 2));
                throw new Error(`API returned success: false - ${JSON.stringify(data)}`);
            }

            if (data.conversations.length === 0) {
                hasMore = false;
            } else {
                // Filter by date range as we go
                const fromDate = new Date(this.config.fromDate);
                const toDate = new Date(this.config.toDate);
                toDate.setHours(23, 59, 59, 999);

                for (const conv of data.conversations) {
                    const convDate = new Date(conv.updated_at || conv.inserted_at);
                    if (convDate >= fromDate && convDate <= toDate) {
                        allConversations.push(conv);
                        // MVP: Stop if we have enough
                        if (allConversations.length >= MVP_LIMIT) {
                            console.log(
                                `⚠️ MVP limit: Reached ${MVP_LIMIT} conversations, stopping fetch`
                            );
                            hasMore = false;
                            break;
                        }
                    }
                }

                if (hasMore) {
                    lastConversationId = data.conversations[data.conversations.length - 1].id;

                    // Check if we've gone past our date range
                    const oldestInBatch = data.conversations[data.conversations.length - 1];
                    const oldestDate = new Date(
                        oldestInBatch.updated_at || oldestInBatch.inserted_at
                    );
                    if (oldestDate < fromDate) {
                        hasMore = false;
                    }

                    await this.delay(300);
                }
            }
        }

        return allConversations;
    }

    private async processConversation(conv: ApiConversation): Promise<void> {
        const now = new Date().toISOString();

        // Store tags and link to conversation
        if (conv.tags && Array.isArray(conv.tags)) {
            for (const tag of conv.tags) {
                if (tag && tag.id && tag.text) {
                    this.upsertTag(tag);
                    this.linkConversationTag(conv.id, tag.id);
                }
            }
        }

        // Store conversation (simplified)
        sqlite.exec(`
            INSERT OR REPLACE INTO conversations (
                id, customer_id, customer_name, snippet, message_count,
                inserted_at, updated_at, scraped_at
            ) VALUES (
                '${this.escape(conv.id)}',
                ${conv.customer_id ? `'${this.escape(conv.customer_id)}'` : "NULL"},
                ${conv.page_customer?.name ? `'${this.escape(conv.page_customer.name)}'` : "NULL"},
                '${this.escape(conv.snippet || "")}',
                ${conv.message_count || 0},
                '${this.escape(conv.inserted_at)}',
                '${this.escape(conv.updated_at || conv.inserted_at)}',
                '${now}'
            )
        `);

        await this.fetchAndStoreMessages(conv);
    }

    private async fetchAndStoreMessages(conv: ApiConversation): Promise<void> {
        let currentCount = 0;
        let hasMore = true;

        // Date range filter for messages
        const fromDate = new Date(this.config.fromDate);
        const toDate = new Date(this.config.toDate);
        toDate.setHours(23, 59, 59, 999);

        while (hasMore) {
            const url = new URL(
                `${BASE_URL}/v1/pages/${this.config.pageId}/conversations/${conv.id}/messages`
            );
            url.searchParams.set("page_access_token", this.config.pageAccessToken);
            if (currentCount > 0) {
                url.searchParams.set("current_count", currentCount.toString());
            }

            const response = await fetch(url.toString(), {
                headers: { Accept: "application/json" },
            });

            if (!response.ok) {
                if (response.status === 500) {
                    console.warn(`⚠️ Server error (500) for conversation ${conv.id}, skipping...`);
                } else {
                    console.error(`Failed to fetch messages for ${conv.id}: ${response.status}`);
                }
                break;
            }

            const data: MessagesResponse = await response.json();

            if (!data.success || !data.messages || data.messages.length === 0) {
                hasMore = false;
            } else {
                // Store customers
                if (data.customers) {
                    for (const customer of data.customers) {
                        this.upsertCustomer(customer);
                    }
                }

                // Store messages only if within date range
                for (const msg of data.messages) {
                    const msgDate = new Date(msg.inserted_at);
                    if (msgDate >= fromDate && msgDate <= toDate) {
                        this.storeMessage(msg, conv);
                        this.messagesScraped++;
                    }
                }

                currentCount += data.messages.length;

                // Check if oldest message in batch is before our date range - stop fetching
                const oldestMsg = data.messages[data.messages.length - 1];
                const oldestMsgDate = new Date(oldestMsg.inserted_at);
                if (oldestMsgDate < fromDate) {
                    hasMore = false;
                } else if (currentCount >= conv.message_count) {
                    hasMore = false;
                } else {
                    await this.delay(200);
                }
            }
        }
    }

    private storeMessage(msg: ApiMessage, conv: ApiConversation): void {
        const content = this.sanitizeMessage(msg.original_message || msg.message || "");

        sqlite.exec(`
            INSERT OR REPLACE INTO messages (
                id, conversation_id, content, sender_id, inserted_at, is_auto_reply, has_risk_flag
            ) VALUES (
                '${this.escape(msg.id)}',
                '${this.escape(msg.conversation_id)}',
                '${this.escape(content)}',
                '${this.escape(msg.from.id)}',
                '${this.escape(msg.inserted_at)}',
                0,
                0
            )
        `);
    }

    private upsertTag(tag: { id: number; text: string }): void {
        sqlite.exec(`
            INSERT OR REPLACE INTO tags (id, name, category)
            VALUES (${tag.id}, '${this.escape(tag.text)}', NULL)
        `);
    }

    private linkConversationTag(conversationId: string, tagId: number): void {
        sqlite.exec(`
            INSERT OR IGNORE INTO conversation_tags (conversation_id, tag_id)
            VALUES ('${this.escape(conversationId)}', ${tagId})
        `);
    }

    private upsertCustomer(customer: any): void {
        const now = new Date().toISOString();
        sqlite.exec(`
            INSERT INTO customers (id, name, gender, first_seen_at, last_seen_at)
            VALUES (
                '${this.escape(customer.id)}',
                '${this.escape(customer.name || "")}',
                ${
                    customer.personal_info?.gender
                        ? `'${this.escape(customer.personal_info.gender)}'`
                        : "NULL"
                },
                '${now}',
                '${now}'
            )
            ON CONFLICT(id) DO UPDATE SET
                name = '${this.escape(customer.name || "")}',
                last_seen_at = '${now}'
        `);
    }

    private sanitizeMessage(message: string): string {
        if (!message) return "";
        let clean = message.replace(/<[^>]+>/g, "");
        clean = clean
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, " ");
        return clean.replace(/\s+/g, " ").trim();
    }

    private createScraperRun(): number {
        sqlite.exec(`
            INSERT INTO scraper_runs (started_at, status, from_date, to_date)
            VALUES ('${new Date().toISOString()}', 'running', '${this.config.fromDate}', '${
            this.config.toDate
        }')
        `);
        const result = sqlite.query("SELECT last_insert_rowid() as id").get() as { id: number };
        return result.id;
    }

    private completeScraperRun(): void {
        if (!this.scraperRunId) return;
        sqlite.exec(`
            UPDATE scraper_runs SET
                completed_at = '${new Date().toISOString()}',
                status = 'completed',
                conversations_scraped = ${this.conversationsScraped},
                messages_scraped = ${this.messagesScraped}
            WHERE id = ${this.scraperRunId}
        `);
    }

    private failScraperRun(errorMessage: string): void {
        if (!this.scraperRunId) return;
        sqlite.exec(`
            UPDATE scraper_runs SET
                completed_at = '${new Date().toISOString()}',
                status = 'failed',
                error_message = '${this.escape(errorMessage)}'
            WHERE id = ${this.scraperRunId}
        `);
    }

    private escape(str: string): string {
        if (!str) return "";
        return str.replace(/'/g, "''").replace(/\\/g, "\\\\");
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

// Helper functions for API
export function getConversationForAnalysis(conversationId: string) {
    const conversation = sqlite
        .query("SELECT * FROM conversations WHERE id = ?")
        .get(conversationId) as any;

    if (!conversation) return null;

    const messages = sqlite
        .query("SELECT * FROM messages WHERE conversation_id = ? ORDER BY inserted_at ASC")
        .all(conversationId) as any[];

    const tags = sqlite
        .query(
            `
            SELECT t.* FROM tags t
            JOIN conversation_tags ct ON t.id = ct.tag_id
            WHERE ct.conversation_id = ?
        `
        )
        .all(conversationId) as any[];

    return { conversation, messages, tags };
}

export function getUnanalyzedConversations(): string[] {
    const results = sqlite
        .query(
            `
            SELECT c.id FROM conversations c
            LEFT JOIN tickets t ON c.id = t.conversation_id
            WHERE t.id IS NULL
            ORDER BY c.inserted_at DESC
        `
        )
        .all() as { id: string }[];

    return results.map((r) => r.id);
}
