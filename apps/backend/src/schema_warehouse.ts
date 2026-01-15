import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// ============================================================================
// DIMENSION TABLES - Slowly Changing Dimensions (SCD Type 1)
// ============================================================================

/**
 * dimDate - Date dimension for time-based analysis
 * Primary key: YYYYMMDD format (e.g., 20260115)
 */
export const dimDate = sqliteTable("dim_date", {
    dateKey: integer("date_key").primaryKey(), // YYYYMMDD
    fullDate: text("full_date").notNull(), // ISO format: 2026-01-15
    year: integer("year").notNull(),
    quarter: integer("quarter").notNull(), // 1-4
    month: integer("month").notNull(), // 1-12
    monthName: text("month_name"), // "January", "Tháng 1"
    week: integer("week"), // Week of year
    day: integer("day").notNull(), // 1-31
    dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday, 6=Saturday
    dayName: text("day_name"), // "Monday", "Thứ Hai"
    isWeekend: integer("is_weekend", { mode: "boolean" }),
    isWorkingDay: integer("is_working_day", { mode: "boolean" }), // Based on O2 SKIN schedule
});

/**
 * dimCustomer - Customer dimension from conversations
 */
export const dimCustomer = sqliteTable("dim_customer", {
    customerKey: text("customer_key").primaryKey(), // conversation_id
    customerName: text("customer_name"),
    platform: text("platform").default("Pancake"), // Source platform
    firstContactDate: text("first_contact_date"),
    lastContactDate: text("last_contact_date"),
});

/**
 * dimStaff - Staff/Employee dimension
 */
export const dimStaff = sqliteTable("dim_staff", {
    staffKey: text("staff_key").primaryKey(), // staff_{name}
    staffName: text("staff_name").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
});

/**
 * dimLocation - Location dimension for geographic analysis
 */
export const dimLocation = sqliteTable("dim_location", {
    locationKey: text("location_key").primaryKey(), // "HCM_Q1", "Provincial_DongNai"
    locationType: text("location_type").notNull(), // "HCM", "Provincial", "Unknown"
    locationDetail: text("location_detail"), // "Quận 1", "Đồng Nai"
    region: text("region"), // "South", "North", "Central"
});

/**
 * dimCustomerType - Customer type dimension
 */
export const dimCustomerType = sqliteTable("dim_customer_type", {
    typeKey: text("type_key").primaryKey(), // "New", "Potential", etc.
    typeName: text("type_name").notNull(),
    typeDescription: text("type_description"),
    priority: integer("priority"), // For sorting in reports
});

/**
 * dimOutcome - Ticket outcome dimension
 */
export const dimOutcome = sqliteTable("dim_outcome", {
    outcomeKey: text("outcome_key").primaryKey(), // "Booked", "Sold", etc.
    outcomeName: text("outcome_name").notNull(),
    outcomeCategory: text("outcome_category"), // "Success", "Pending", "Failed"
    isPositive: integer("is_positive", { mode: "boolean" }),
});

// ============================================================================
// FACT TABLES - Transactional/Event data
// ============================================================================

/**
 * factTickets - Main fact table for ticket analysis
 * Grain: One row per ticket (conversation segment)
 */
export const factTickets = sqliteTable(
    "fact_tickets",
    {
        ticketId: text("ticket_id").primaryKey(),

        // Foreign Keys to Dimensions
        customerKey: text("customer_key").references(() => dimCustomer.customerKey),
        staffKey: text("staff_key").references(() => dimStaff.staffKey),
        locationKey: text("location_key").references(() => dimLocation.locationKey),
        customerTypeKey: text("customer_type_key").references(() => dimCustomerType.typeKey),
        outcomeKey: text("outcome_key").references(() => dimOutcome.outcomeKey),
        createdDateKey: integer("created_date_key").references(() => dimDate.dateKey),
        closedDateKey: integer("closed_date_key").references(() => dimDate.dateKey),

        // Degenerate Dimensions (ticket-specific, no separate dim table needed)
        conversationId: text("conversation_id").notNull(),
        status: text("status").notNull(), // "OPEN", "CLOSED"

        // Descriptive fields (not for aggregation, just for drill-down)
        outcomeReason: text("outcome_reason"), // Verbatim quote
        repQualitySummary: text("rep_quality_summary"), // "nhiệt tình", "máy móc"
        ticketSummary: text("ticket_summary"),

        // Measures (numeric values for aggregation)
        autoReplyCount: integer("auto_reply_count").default(0),
        humanResponseCount: integer("human_response_count").default(0),
        firstResponseMinutes: integer("first_response_minutes"),
        resolutionMinutes: integer("resolution_minutes"),

        // Flags (boolean measures)
        hasRisk: integer("has_risk", { mode: "boolean" }).default(false),
        isFirstContactResolution: integer("is_first_contact_resolution", { mode: "boolean" }),

        // Risk evidence (for drill-down only)
        riskEvidence: text("risk_evidence"),

        // Audit
        createdAt: text("created_at"),
        closedAt: text("closed_at"),
        lastUpdated: text("last_updated"),
    },
    (t) => ({
        // Indexes on foreign keys for fast joins
        customerIdx: index("idx_fact_customer").on(t.customerKey),
        staffIdx: index("idx_fact_staff").on(t.staffKey),
        locationIdx: index("idx_fact_location").on(t.locationKey),
        customerTypeIdx: index("idx_fact_customer_type").on(t.customerTypeKey),
        outcomeIdx: index("idx_fact_outcome").on(t.outcomeKey),
        createdDateIdx: index("idx_fact_created_date").on(t.createdDateKey),
        closedDateIdx: index("idx_fact_closed_date").on(t.closedDateKey),
        statusIdx: index("idx_fact_status").on(t.status),
        riskIdx: index("idx_fact_risk").on(t.hasRisk),
    })
);

/**
 * factRiskIncidents - Separate fact table for risk tracking (galaxy schema)
 * Grain: One row per risk incident
 */
export const factRiskIncidents = sqliteTable(
    "fact_risk_incidents",
    {
        incidentId: text("incident_id").primaryKey(),

        // Foreign Keys
        ticketId: text("ticket_id").references(() => factTickets.ticketId),
        staffKey: text("staff_key").references(() => dimStaff.staffKey),
        createdDateKey: integer("created_date_key").references(() => dimDate.dateKey),

        // Degenerate Dimension
        conversationId: text("conversation_id"),

        // Descriptive
        evidence: text("evidence"), // Verbatim quote

        // Workflow status
        reviewStatus: text("review_status").default("Pending"), // "Pending", "Reviewed", "Actioned", "Dismissed"
        reviewedBy: text("reviewed_by"),
        reviewedAt: text("reviewed_at"),
        reviewNotes: text("review_notes"),

        // Audit
        createdAt: text("created_at"),
    },
    (t) => ({
        ticketIdx: index("idx_risk_ticket").on(t.ticketId),
        staffIdx: index("idx_risk_staff").on(t.staffKey),
        dateIdx: index("idx_risk_date").on(t.createdDateKey),
        statusIdx: index("idx_risk_status").on(t.reviewStatus),
    })
);

/**
 * factDailySnapshot - Daily aggregated metrics (snapshot fact table)
 * Grain: One row per date per staff (or all staff if staffKey is null)
 */
export const factDailySnapshot = sqliteTable(
    "fact_daily_snapshot",
    {
        snapshotId: text("snapshot_id").primaryKey(), // "20260115" or "20260115_staff_lan"
        dateKey: integer("date_key")
            .references(() => dimDate.dateKey)
            .notNull(),
        staffKey: text("staff_key").references(() => dimStaff.staffKey), // null = all staff

        // Measures
        openTicketsCount: integer("open_tickets_count").default(0),
        newTicketsCount: integer("new_tickets_count").default(0),
        closedTicketsCount: integer("closed_tickets_count").default(0),

        // Audit
        calculatedAt: text("calculated_at"),
    },
    (t) => ({
        dateIdx: index("idx_snapshot_date").on(t.dateKey),
        staffIdx: index("idx_snapshot_staff").on(t.staffKey),
    })
);
