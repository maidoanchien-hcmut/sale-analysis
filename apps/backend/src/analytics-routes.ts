import { Elysia, t } from "elysia";
import { db } from "./db";
import {
    dimDate,
    dimCustomer,
    dimStaff,
    dimLocation,
    dimCustomerType,
    dimOutcome,
    factTickets,
    factRiskIncidents,
    factDailySnapshot,
} from "./schema_warehouse";
import { eq, gte, lte, and, desc, sql } from "drizzle-orm";

/**
 * Analytics API routes for the BI dashboard
 */
export const analyticsRoutes = new Elysia({ prefix: "/api" })
    // =========================================================================
    // Dimension endpoints
    // =========================================================================
    .get("/dimensions/staff", async () => {
        return db.select().from(dimStaff);
    })

    .get("/dimensions/locations", async () => {
        return db.select().from(dimLocation);
    })

    .get("/dimensions/customer-types", async () => {
        return db.select().from(dimCustomerType);
    })

    .get("/dimensions/outcomes", async () => {
        return db.select().from(dimOutcome);
    })

    // =========================================================================
    // Fact table endpoints with filtering
    // =========================================================================
    .get(
        "/tickets",
        async ({ query }) => {
            const conditions: any[] = [];

            // Date range filter
            if (query.startDate) {
                const startKey = parseInt(query.startDate.replace(/-/g, ""));
                conditions.push(gte(factTickets.createdDateKey, startKey));
            }
            if (query.endDate) {
                const endKey = parseInt(query.endDate.replace(/-/g, ""));
                conditions.push(lte(factTickets.createdDateKey, endKey));
            }

            // Other filters
            if (query.staffKey) {
                conditions.push(eq(factTickets.staffKey, query.staffKey));
            }
            if (query.locationKey) {
                conditions.push(eq(factTickets.locationKey, query.locationKey));
            }
            if (query.customerTypeKey) {
                conditions.push(eq(factTickets.customerTypeKey, query.customerTypeKey));
            }
            if (query.outcomeKey) {
                conditions.push(eq(factTickets.outcomeKey, query.outcomeKey));
            }
            if (query.status) {
                conditions.push(eq(factTickets.status, query.status as "OPEN" | "CLOSED"));
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

            return db
                .select()
                .from(factTickets)
                .where(whereClause)
                .orderBy(desc(factTickets.createdDateKey))
                .limit(query.limit ? parseInt(query.limit) : 1000);
        },
        {
            query: t.Object({
                startDate: t.Optional(t.String()),
                endDate: t.Optional(t.String()),
                staffKey: t.Optional(t.String()),
                locationKey: t.Optional(t.String()),
                customerTypeKey: t.Optional(t.String()),
                outcomeKey: t.Optional(t.String()),
                status: t.Optional(t.String()),
                limit: t.Optional(t.String()),
            }),
        }
    )

    .get("/risk-incidents", async () => {
        return db.select().from(factRiskIncidents).orderBy(desc(factRiskIncidents.createdAt));
    })

    .get("/daily-snapshots", async ({ query }) => {
        const conditions: any[] = [];

        if (query.startDate) {
            const startKey = parseInt(query.startDate.replace(/-/g, ""));
            conditions.push(gte(factDailySnapshot.dateKey, startKey));
        }
        if (query.endDate) {
            const endKey = parseInt(query.endDate.replace(/-/g, ""));
            conditions.push(lte(factDailySnapshot.dateKey, endKey));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        return db
            .select()
            .from(factDailySnapshot)
            .where(whereClause)
            .orderBy(desc(factDailySnapshot.dateKey));
    })

    // =========================================================================
    // Aggregation endpoints for charts
    // =========================================================================
    .get(
        "/analytics/distribution/:dimension",
        async ({ params, query }) => {
            const { dimension } = params;

            // Build date filter
            const conditions: any[] = [];
            if (query.startDate) {
                const startKey = parseInt(query.startDate.replace(/-/g, ""));
                conditions.push(gte(factTickets.createdDateKey, startKey));
            }
            if (query.endDate) {
                const endKey = parseInt(query.endDate.replace(/-/g, ""));
                conditions.push(lte(factTickets.createdDateKey, endKey));
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

            // Get column to group by
            let groupColumn: any;
            switch (dimension) {
                case "outcome":
                    groupColumn = factTickets.outcomeKey;
                    break;
                case "customerType":
                    groupColumn = factTickets.customerTypeKey;
                    break;
                case "location":
                    groupColumn = factTickets.locationKey;
                    break;
                case "staff":
                    groupColumn = factTickets.staffKey;
                    break;
                case "status":
                    groupColumn = factTickets.status;
                    break;
                case "repQuality":
                    groupColumn = factTickets.repQualitySummary;
                    break;
                default:
                    return { error: "Invalid dimension" };
            }

            const result = await db
                .select({
                    label: groupColumn,
                    value: sql<number>`COUNT(*)`.as("count"),
                })
                .from(factTickets)
                .where(whereClause)
                .groupBy(groupColumn)
                .orderBy(desc(sql`count`));

            // Calculate percentages
            const total = result.reduce((sum, r) => sum + (r.value || 0), 0);
            return result.map((r) => ({
                label: r.label || "Unknown",
                value: r.value || 0,
                percentage: total > 0 ? Math.round(((r.value || 0) / total) * 100) : 0,
            }));
        },
        {
            params: t.Object({
                dimension: t.String(),
            }),
            query: t.Object({
                startDate: t.Optional(t.String()),
                endDate: t.Optional(t.String()),
            }),
        }
    )

    .get(
        "/analytics/time-series",
        async ({ query }) => {
            const conditions: any[] = [];

            if (query.startDate) {
                const startKey = parseInt(query.startDate.replace(/-/g, ""));
                conditions.push(gte(factTickets.createdDateKey, startKey));
            }
            if (query.endDate) {
                const endKey = parseInt(query.endDate.replace(/-/g, ""));
                conditions.push(lte(factTickets.createdDateKey, endKey));
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

            const result = await db
                .select({
                    dateKey: factTickets.createdDateKey,
                    count: sql<number>`COUNT(*)`.as("count"),
                })
                .from(factTickets)
                .where(whereClause)
                .groupBy(factTickets.createdDateKey)
                .orderBy(factTickets.createdDateKey);

            // Convert dateKey to date string
            return result.map((r) => {
                const dateStr = String(r.dateKey);
                const formatted = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(
                    6,
                    8
                )}`;
                return {
                    date: formatted,
                    value: r.count || 0,
                };
            });
        },
        {
            query: t.Object({
                startDate: t.Optional(t.String()),
                endDate: t.Optional(t.String()),
            }),
        }
    )

    .get("/analytics/summary", async ({ query }) => {
        const conditions: any[] = [];

        if (query.startDate) {
            const startKey = parseInt(query.startDate.replace(/-/g, ""));
            conditions.push(gte(factTickets.createdDateKey, startKey));
        }
        if (query.endDate) {
            const endKey = parseInt(query.endDate.replace(/-/g, ""));
            conditions.push(lte(factTickets.createdDateKey, endKey));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        // Get all tickets for calculation
        const tickets = await db.select().from(factTickets).where(whereClause);

        const total = tickets.length;
        const open = tickets.filter((t) => t.status === "OPEN").length;
        const closed = tickets.filter((t) => t.status === "CLOSED").length;
        const withRisk = tickets.filter((t) => t.hasRisk).length;
        const fcr = tickets.filter((t) => t.isFirstContactResolution).length;
        const positive = tickets.filter(
            (t) => t.outcomeKey && ["Booked", "Sold", "Support_Done"].includes(t.outcomeKey)
        ).length;

        const resolutionTimes = tickets
            .filter((t) => t.resolutionMinutes !== null)
            .map((t) => t.resolutionMinutes!);
        const responseTimes = tickets
            .filter((t) => t.firstResponseMinutes !== null)
            .map((t) => t.firstResponseMinutes!);

        return {
            totalTickets: total,
            openTickets: open,
            closedTickets: closed,
            avgResolutionMinutes:
                resolutionTimes.length > 0
                    ? Math.round(
                          resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
                      )
                    : null,
            avgFirstResponseMinutes:
                responseTimes.length > 0
                    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
                    : null,
            riskIncidentsCount: withRisk,
            fcrRate: closed > 0 ? Math.round((fcr / closed) * 100) : null,
            successRate: closed > 0 ? Math.round((positive / closed) * 100) : null,
        };
    });
