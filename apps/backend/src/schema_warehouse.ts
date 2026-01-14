import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

// ==========================================
// A. SHARED DIMENSIONS (The Context)
// ==========================================

export const dimDate = sqliteTable("dim_date", {
  dateId: integer("date_id").primaryKey(), // Format: YYYYMMDD
  fullDate: text("full_date"),             // ISO String
  year: integer("year"),
  month: integer("month"),
  day: integer("day"),
  dayOfWeek: integer("day_of_week"),       // 0=Sun, 6=Sat
});

export const dimTime = sqliteTable("dim_time", {
  hourId: integer("hour_id").primaryKey(), // 0-23
  label: text("label"),                    // "10:00 AM"
});

export const dimStaff = sqliteTable("dim_staff", {
  id: text("id").primaryKey(), // Staff ID from API
  name: text("name"),
  fbId: text("fb_id"),
  role: text("role"),
  isActive: integer("is_active", { mode: "boolean" }),
});

export const dimCustomer = sqliteTable("dim_customer", {
  id: text("id").primaryKey(), // Customer ID
  name: text("name"),
  platform: text("platform"),  // "Facebook", "Instagram"
});

// ==========================================
// B. FACT 1: OPERATIONAL METRICS (The "Hard" Numbers)
// Source: GET /statistics/users API
// ==========================================

export const factStaffHourlyStat = sqliteTable(
  "fact_staff_hourly_stat",
  {
    staffId: text("staff_id")
      .notNull()
      .references(() => dimStaff.id),
    dateId: integer("date_id")
      .notNull()
      .references(() => dimDate.dateId),
    hourId: integer("hour_id")
      .notNull()
      .references(() => dimTime.hourId),

    // Metrics directly from API JSON
    avgResponseTimeMs: integer("avg_response_time_ms"), // "average_response_time"
    inboxCount: integer("inbox_count"),                 // Total msgs received
    uniqueInboxCount: integer("unique_inbox_count"),    // Unique customers served
    commentCount: integer("comment_count"),
    phoneCount: integer("phone_count"),
  },
  (t) => ({
    // Composite Key to ensure no duplicates per staff/hour
    pk: primaryKey({ columns: [t.staffId, t.dateId, t.hourId] }),
  }),
);

// ==========================================
// C. FACT 2: QUALITY AUDIT (The "Soft" Insights)
// Source: LLM Python Service
// ==========================================

export const factChatAudit = sqliteTable("fact_chat_audit", {
  conversationId: text("conversation_id").primaryKey(),

  // Foreign Keys
  primaryStaffId: text("primary_staff_id").references(() => dimStaff.id),
  customerId: text("customer_id").references(() => dimCustomer.id),
  dateId: integer("date_id").references(() => dimDate.dateId), // Date of analysis

  // --- AUDIT SCORES ---
  sentimentLabel: text("sentiment_label"), // "Positive", "Negative", "Neutral"
  riskLevel: text("risk_level"),           // "High", "Medium", "Safe"
  repQualityLabel: text("rep_quality"),    // "Consultative", "Transactional", "Robot", "Pushy", "Negligent"

  // --- MARKET INTEL ---
  userIntent: text("user_intent"), // "Purchase", "Complaint", "Support"
  // Store JSON as TEXT; parse/stringify in app code.
  competitorsMentioned: text("competitors_mentioned"), // ["Shopee", "Lazada"]

  // --- EVIDENCE (The Proof) ---
  // Stores JSON array of quotes: [{ category: "Risk", quote: "..." }]
  auditEvidenceJson: text("audit_evidence_json"),

  updatedAt: text("updated_at"),
});