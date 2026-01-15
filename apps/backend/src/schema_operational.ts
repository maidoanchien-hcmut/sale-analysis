import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const conversations = sqliteTable("conversations", {
    id: text("id").primaryKey(),
    pageId: text("page_id"),
    customerName: text("customer_name"),
    snippet: text("snippet"),
    updatedAt: text("updated_at"),

    messageCountTotal: integer("message_count_total").default(0),
    lastAnalyzedMessageCount: integer("last_analyzed_message_count").default(0),

    activeTicketId: text("active_ticket_id"),

    activeTicketSummary: text("active_ticket_summary").default(""),

    lastAnalyzedMessageId: text("last_analyzed_message_id"),
    lastAnalyzedAt: text("last_analyzed_at"),

    // Platform tag data (when API access becomes available)
    assignedStaffTagId: text("assigned_staff_tag_id"),
    customerDemographicTagId: text("customer_demographic_tag_id"),
    platformTagIds: text("platform_tag_ids"), // JSON array of tag IDs

    fullJson: text("full_json"), // JSON string
});

export const messages = sqliteTable(
    "messages",
    {
        id: text("id").primaryKey(),
        conversationId: text("conversation_id").references(() => conversations.id),
        senderId: text("sender_id"),
        senderName: text("sender_name"),
        content: text("content"),
        insertedAt: text("inserted_at"),

        isFromShop: integer("is_from_shop", { mode: "boolean" }),
        isAutoReply: integer("is_auto_reply", { mode: "boolean" }), // LLM-detected

        fullJson: text("full_json"),
    },
    (t) => ({
        convIdx: index("idx_msg_conv").on(t.conversationId),
        autoReplyIdx: index("idx_msg_auto").on(t.isAutoReply),
    })
);

export const dimPlatformTags = sqliteTable("dim_platform_tags", {
    id: text("id").primaryKey(),
    name: text("name"),
    color: text("color"),
    pageId: text("page_id"),
    lastSyncedAt: text("last_synced_at"),
});

export const factAnalysisQueue = sqliteTable("fact_analysis_queue", {
    conversationId: text("conversation_id")
        .primaryKey()
        .references(() => conversations.id),
    suggestedTagIds: text("suggested_tag_ids"),
    tagsApplied: integer("tags_applied", { mode: "boolean" }).default(false),
    createdAt: text("created_at"),
});
