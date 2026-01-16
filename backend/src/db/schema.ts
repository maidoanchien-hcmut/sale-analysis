import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ==================== OPERATIONAL TABLES ====================

// Tags lookup table
export const tags = sqliteTable("tags", {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category"),
});

// Conversations from API
export const conversations = sqliteTable(
    "conversations",
    {
        id: text("id").primaryKey(),
        customerId: text("customer_id"),
        customerName: text("customer_name"),
        snippet: text("snippet"),
        messageCount: integer("message_count").default(0),
        insertedAt: text("inserted_at").notNull(),
        updatedAt: text("updated_at").notNull(),
        scrapedAt: text("scraped_at").notNull(),
    },
    (table) => [index("idx_conversations_inserted_at").on(table.insertedAt)]
);

// Conversation-Tag junction table
export const conversationTags = sqliteTable(
    "conversation_tags",
    {
        conversationId: text("conversation_id")
            .notNull()
            .references(() => conversations.id),
        tagId: integer("tag_id")
            .notNull()
            .references(() => tags.id),
    },
    (table) => [
        primaryKey({ columns: [table.conversationId, table.tagId] }),
        index("idx_conversation_tags_conversation").on(table.conversationId),
        index("idx_conversation_tags_tag").on(table.tagId),
    ]
);

// Messages from API
export const messages = sqliteTable(
    "messages",
    {
        id: text("id").primaryKey(),
        conversationId: text("conversation_id")
            .notNull()
            .references(() => conversations.id),
        content: text("content"),
        senderId: text("sender_id").notNull(),
        insertedAt: text("inserted_at").notNull(),
        isAutoReply: integer("is_auto_reply", { mode: "boolean" }).default(false),
        hasRiskFlag: integer("has_risk_flag", { mode: "boolean" }).default(false),
    },
    (table) => [
        index("idx_messages_conversation_id").on(table.conversationId),
        index("idx_messages_inserted_at").on(table.insertedAt),
    ]
);

// Customers
export const customers = sqliteTable("customers", {
    id: text("id").primaryKey(),
    name: text("name"),
    gender: text("gender"),
    firstSeenAt: text("first_seen_at"),
    lastSeenAt: text("last_seen_at"),
});

// Staff members
export const staff = sqliteTable("staff", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
});

// ==================== ANALYTICS TABLES ====================

// Tickets - a range of messages in a conversation
export const tickets = sqliteTable(
    "tickets",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        conversationId: text("conversation_id")
            .notNull()
            .references(() => conversations.id),
        staffId: text("staff_id").references(() => staff.id),
        startMessageId: text("start_message_id")
            .notNull()
            .references(() => messages.id),
        endMessageId: text("end_message_id")
            .notNull()
            .references(() => messages.id),

        // LLM analysis results
        sentiment: text("sentiment"), // positive, neutral, negative
        outcome: text("outcome"), // summary of what happened

        // Staff quality analysis
        staffAttitude: text("staff_attitude"), // enthusiastic, professional, mechanical, pushy, rude
        staffQuality: text("staff_quality"), // excellent, good, average, poor

        isResolved: integer("is_resolved", { mode: "boolean" }),

        // Timestamps
        startedAt: text("started_at").notNull(),
        endedAt: text("ended_at").notNull(),
        analyzedAt: text("analyzed_at"),
    },
    (table) => [
        index("idx_tickets_conversation_id").on(table.conversationId),
        index("idx_tickets_staff_id").on(table.staffId),
    ]
);

// Risk flags found in messages
export const riskFlags = sqliteTable(
    "risk_flags",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        messageId: text("message_id")
            .notNull()
            .references(() => messages.id),
        ticketId: integer("ticket_id").references(() => tickets.id),
        riskType: text("risk_type").notNull(), // non_compliant, incorrect_info, unprofessional, missed_opportunity
    },
    (table) => [
        index("idx_risk_flags_message_id").on(table.messageId),
        index("idx_risk_flags_type").on(table.riskType),
    ]
);

// ==================== TRACKING TABLES ====================

export const scraperRuns = sqliteTable("scraper_runs", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    status: text("status").notNull(), // running, completed, failed
    fromDate: text("from_date").notNull(),
    toDate: text("to_date").notNull(),
    conversationsScraped: integer("conversations_scraped").default(0),
    messagesScraped: integer("messages_scraped").default(0),
    errorMessage: text("error_message"),
});

export const llmAnalysisRuns = sqliteTable("llm_analysis_runs", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    status: text("status").notNull(),
    conversationsAnalyzed: integer("conversations_analyzed").default(0),
    ticketsCreated: integer("tickets_created").default(0),
    errorMessage: text("error_message"),
});

// ==================== RELATIONS ====================

export const conversationsRelations = relations(conversations, ({ many, one }) => ({
    messages: many(messages),
    conversationTags: many(conversationTags),
    customer: one(customers, {
        fields: [conversations.customerId],
        references: [customers.id],
    }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
    conversation: one(conversations, {
        fields: [messages.conversationId],
        references: [conversations.id],
    }),
}));

export const conversationTagsRelations = relations(conversationTags, ({ one }) => ({
    conversation: one(conversations, {
        fields: [conversationTags.conversationId],
        references: [conversations.id],
    }),
    tag: one(tags, {
        fields: [conversationTags.tagId],
        references: [tags.id],
    }),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
    conversation: one(conversations, {
        fields: [tickets.conversationId],
        references: [conversations.id],
    }),
    staff: one(staff, {
        fields: [tickets.staffId],
        references: [staff.id],
    }),
    startMessage: one(messages, {
        fields: [tickets.startMessageId],
        references: [messages.id],
    }),
    endMessage: one(messages, {
        fields: [tickets.endMessageId],
        references: [messages.id],
    }),
    riskFlags: many(riskFlags),
}));

export const riskFlagsRelations = relations(riskFlags, ({ one }) => ({
    message: one(messages, {
        fields: [riskFlags.messageId],
        references: [messages.id],
    }),
    ticket: one(tickets, {
        fields: [riskFlags.ticketId],
        references: [tickets.id],
    }),
}));
