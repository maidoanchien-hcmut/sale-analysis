import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ==========================================
// 1. RAW DATA & SMART TRIGGER TRACKING
// ==========================================

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(), // Pancake Conversation ID
  pageId: text("page_id"),
  customerName: text("customer_name"),
  snippet: text("snippet"),
  updatedAt: text("updated_at"), // Last activity time from API

  // --- SMART TRIGGER COLUMNS (The "Delta" Logic) ---
  messageCountTotal: integer("message_count_total").default(0), // Total msgs currently in API
  lastAnalyzedMessageCount: integer("last_analyzed_message_count").default(0), // Count at last analysis

  // --- CONTEXT CARRY-OVER (The "Rolling Summary") ---
  contextSummary: text("context_summary").default(""), // Compressed history from LLM
  lastAnalyzedMessageId: text("last_analyzed_message_id"), // Pointer to last read message
  lastAnalyzedAt: text("last_analyzed_at"), // Timestamp of last run

  // --- METADATA ---
  // Store JSON as TEXT; parse/stringify in app code.
  fullJson: text("full_json"), // Backup of raw API object
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").references(() => conversations.id),
  senderId: text("sender_id"),
  senderName: text("sender_name"),
  content: text("content"),
  insertedAt: text("inserted_at"), // Timestamp of message
  isFromShop: integer("is_from_shop", { mode: "boolean" }), // True if staff
  // Store JSON as TEXT; parse/stringify in app code.
  fullJson: text("full_json"),
});

// ==========================================
// 2. METADATA CACHE (For Context & Actions)
// ==========================================

// Cache of available tags from GET /tags API
export const dimPlatformTags = sqliteTable("dim_platform_tags", {
  id: text("id").primaryKey(), // Tag ID from Pancake
  name: text("name"),
  color: text("color"),
  pageId: text("page_id"),
  lastSyncedAt: text("last_synced_at"),
});

// Staging table for LLM results before we push them to the Platform
export const factAnalysisQueue = sqliteTable("fact_analysis_queue", {
  conversationId: text("conversation_id").primaryKey().references(() => conversations.id),

  // LLM Output
  // Store JSON as TEXT; parse/stringify in app code.
  suggestedTagIds: text("suggested_tag_ids"),
  suggestedAssigneeId: text("suggested_assignee_id"),

  // Sync Status
  tagsApplied: integer("tags_applied", { mode: "boolean" }).default(false),
  assignmentApplied: integer("assignment_applied", { mode: "boolean" }).default(false),
  createdAt: text("created_at"),
});