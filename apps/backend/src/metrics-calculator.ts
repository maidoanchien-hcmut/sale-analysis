import { db } from "./db";
import { eq, and, lte, or, gte } from "drizzle-orm";
import { factTickets, factDailySnapshot, dimStaff, dimDate } from "./schema_warehouse";
import { messages } from "./schema_operational";

// ============================================================================
// WORKING HOURS CONFIG - O2 SKIN Schedule
// ============================================================================

interface TimeRange {
    start: number; // minutes from midnight (e.g., 8:00 = 480)
    end: number;
}

interface DaySchedule {
    ranges: TimeRange[];
}

// Day of week: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
const WORKING_HOURS: Record<number, DaySchedule> = {
    0: {
        ranges: [
            { start: 480, end: 690 },
            { start: 780, end: 1020 },
        ],
    }, // Sunday: 8:00-11:30, 13:00-17:00
    1: { ranges: [{ start: 780, end: 1140 }] }, // Monday: 13:00-19:00
    2: {
        ranges: [
            { start: 540, end: 690 },
            { start: 780, end: 1140 },
        ],
    }, // Tuesday: 9:00-11:30, 13:00-19:00
    3: { ranges: [{ start: 780, end: 1140 }] }, // Wednesday: 13:00-19:00
    4: { ranges: [{ start: 780, end: 1140 }] }, // Thursday: 13:00-19:00
    5: { ranges: [{ start: 780, end: 1140 }] }, // Friday: 13:00-19:00
    6: {
        ranges: [
            { start: 480, end: 690 },
            { start: 780, end: 1020 },
        ],
    }, // Saturday: 8:00-11:30, 13:00-17:00
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function parseTimestamp(ts: string): Date {
    return new Date(ts);
}

function getMinutesFromMidnight(date: Date): number {
    return date.getHours() * 60 + date.getMinutes();
}

function isWithinWorkingHours(date: Date): boolean {
    const dayOfWeek = date.getDay();
    const minutes = getMinutesFromMidnight(date);
    const schedule = WORKING_HOURS[dayOfWeek];

    if (!schedule) return false;

    return schedule.ranges.some((range) => minutes >= range.start && minutes <= range.end);
}

/**
 * Calculate working minutes between two timestamps.
 * Only counts time during working hours.
 */
function calculateWorkingMinutes(start: Date, end: Date): number {
    if (start >= end) return 0;

    let totalMinutes = 0;
    const current = new Date(start);

    while (current < end) {
        if (isWithinWorkingHours(current)) {
            totalMinutes++;
        }
        current.setMinutes(current.getMinutes() + 1);
    }

    return totalMinutes;
}

/**
 * Quick estimation for large time gaps (optimization)
 */
function estimateWorkingMinutes(start: Date, end: Date): number {
    const diffMs = end.getTime() - start.getTime();
    const diffMinutes = diffMs / (1000 * 60);

    // If less than 1 day, calculate precisely
    if (diffMinutes < 1440) {
        return calculateWorkingMinutes(start, end);
    }

    // For longer periods, estimate: ~6-8 working hours per day on average
    const days = diffMinutes / 1440;
    const avgWorkingMinutesPerDay = 420; // ~7 hours
    return Math.round(days * avgWorkingMinutesPerDay);
}

// ============================================================================
// TICKET METRICS CALCULATOR
// ============================================================================

interface TicketMetrics {
    firstResponseMinutes: number | null;
    resolutionMinutes: number | null;
    isFirstContactResolution: boolean;
    autoReplyCount: number;
    humanResponseCount: number;
}

/**
 * Calculate metrics for a single ticket based on its messages.
 */
export async function calculateTicketMetrics(
    ticketId: string,
    conversationId: string,
    createdAt: string,
    closedAt: string | null
): Promise<TicketMetrics> {
    // Get all messages for this conversation
    const msgs = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.insertedAt);

    let firstResponseMinutes: number | null = null;
    let resolutionMinutes: number | null = null;
    let autoReplyCount = 0;
    let humanResponseCount = 0;
    let customerMessageCount = 0;
    let staffResponseBeforeCustomerSecondMessage = false;

    const ticketCreatedDate = parseTimestamp(createdAt);
    let firstCustomerMessageTime: Date | null = null;
    let firstHumanResponseTime: Date | null = null;

    for (const msg of msgs) {
        const msgTime = parseTimestamp(msg.insertedAt!);

        if (!msg.isFromShop) {
            // Customer message
            customerMessageCount++;
            if (!firstCustomerMessageTime) {
                firstCustomerMessageTime = msgTime;
            }
        } else {
            // Shop message
            if (msg.isAutoReply) {
                autoReplyCount++;
            } else {
                humanResponseCount++;

                // Track first human response
                if (!firstHumanResponseTime && firstCustomerMessageTime) {
                    firstHumanResponseTime = msgTime;
                    firstResponseMinutes = estimateWorkingMinutes(
                        firstCustomerMessageTime,
                        firstHumanResponseTime
                    );
                }

                // Check if staff responded before customer's second message
                if (customerMessageCount === 1 && !staffResponseBeforeCustomerSecondMessage) {
                    staffResponseBeforeCustomerSecondMessage = true;
                }
            }
        }
    }

    // Calculate resolution time if ticket is closed
    if (closedAt) {
        const closedDate = parseTimestamp(closedAt);
        resolutionMinutes = estimateWorkingMinutes(ticketCreatedDate, closedDate);
    }

    // First Contact Resolution: resolved with only 1 customer interaction round
    const isFirstContactResolution =
        closedAt !== null && customerMessageCount <= 2 && humanResponseCount >= 1;

    return {
        firstResponseMinutes,
        resolutionMinutes,
        isFirstContactResolution,
        autoReplyCount,
        humanResponseCount,
    };
}

/**
 * Update metrics for a specific ticket in the database.
 */
export async function updateTicketMetrics(ticketId: string): Promise<void> {
    const ticket = await db
        .select()
        .from(factTickets)
        .where(eq(factTickets.ticketId, ticketId))
        .get();

    if (!ticket) return;

    const metrics = await calculateTicketMetrics(
        ticketId,
        ticket.conversationId,
        ticket.createdAt || new Date().toISOString(),
        ticket.closedAt
    );

    await db
        .update(factTickets)
        .set({
            firstResponseMinutes: metrics.firstResponseMinutes,
            resolutionMinutes: metrics.resolutionMinutes,
            isFirstContactResolution: metrics.isFirstContactResolution,
            autoReplyCount: metrics.autoReplyCount,
            humanResponseCount: metrics.humanResponseCount,
        })
        .where(eq(factTickets.ticketId, ticketId));
}

// ============================================================================
// DAILY SNAPSHOT AGGREGATOR
// ============================================================================

/**
 * Convert date string to dateKey (YYYYMMDD format)
 */
function toDateKey(date: string): number {
    return parseInt(date.replace(/-/g, ""), 10);
}

/**
 * Ensure dimDate entry exists for a given date
 */
async function ensureDateDimension(date: string): Promise<number> {
    const dateKey = toDateKey(date);
    const dateObj = new Date(date);

    await db
        .insert(dimDate)
        .values({
            dateKey,
            fullDate: date,
            year: dateObj.getFullYear(),
            quarter: Math.floor(dateObj.getMonth() / 3) + 1,
            month: dateObj.getMonth() + 1,
            monthName: dateObj.toLocaleString("vi-VN", { month: "long" }),
            week: Math.ceil(
                (dateObj.getDate() +
                    new Date(dateObj.getFullYear(), dateObj.getMonth(), 1).getDay()) /
                    7
            ),
            day: dateObj.getDate(),
            dayOfWeek: dateObj.getDay(),
            dayName: dateObj.toLocaleString("vi-VN", { weekday: "long" }),
            isWeekend: dateObj.getDay() === 0 || dateObj.getDay() === 6,
            isWorkingDay: dateObj.getDay() !== 0 && dateObj.getDay() !== 6,
        })
        .onConflictDoNothing();

    return dateKey;
}

/**
 * Calculate and store daily snapshot for a specific date.
 * @param date - Date string in YYYY-MM-DD format
 * @param staffKey - Optional staff key for per-staff metrics (null = all staff)
 */
export async function calculateDailySnapshot(
    date: string,
    staffKey: string | null = null
): Promise<void> {
    const dateKey = await ensureDateDimension(date);
    const endOfDay = `${date}T23:59:59`;
    const startOfDay = `${date}T00:00:00`;

    // Count tickets that were OPEN at end of this date
    const openQuery = staffKey
        ? and(
              lte(factTickets.createdAt, endOfDay),
              eq(factTickets.staffKey, staffKey),
              or(eq(factTickets.status, "OPEN"), gte(factTickets.closedAt, endOfDay))
          )
        : and(
              lte(factTickets.createdAt, endOfDay),
              or(eq(factTickets.status, "OPEN"), gte(factTickets.closedAt, endOfDay))
          );

    const openTickets = await db.select().from(factTickets).where(openQuery);
    const openTicketsCount = openTickets.length;

    // Count new tickets created on this date
    const newQuery = staffKey
        ? and(eq(factTickets.createdDateKey, dateKey), eq(factTickets.staffKey, staffKey))
        : eq(factTickets.createdDateKey, dateKey);

    const newTickets = await db.select().from(factTickets).where(newQuery);
    const newTicketsCount = newTickets.length;

    // Count closed tickets on this date
    const closedQuery = staffKey
        ? and(eq(factTickets.closedDateKey, dateKey), eq(factTickets.staffKey, staffKey))
        : eq(factTickets.closedDateKey, dateKey);

    const closedTickets = await db.select().from(factTickets).where(closedQuery);
    const closedTicketsCount = closedTickets.length;

    // Upsert daily snapshot
    const snapshotId = staffKey ? `${dateKey}_${staffKey}` : `${dateKey}`;

    await db
        .insert(factDailySnapshot)
        .values({
            snapshotId,
            dateKey,
            staffKey,
            openTicketsCount,
            newTicketsCount,
            closedTicketsCount,
            calculatedAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
            target: factDailySnapshot.snapshotId,
            set: {
                openTicketsCount,
                newTicketsCount,
                closedTicketsCount,
                calculatedAt: new Date().toISOString(),
            },
        });
}

/**
 * Calculate daily snapshot for all staff + aggregate for a date.
 */
export async function calculateAllDailySnapshots(date: string): Promise<void> {
    // First, calculate aggregate (all staff)
    await calculateDailySnapshot(date, null);

    // Then, calculate per-staff metrics
    const staffList = await db.select().from(dimStaff);
    for (const staff of staffList) {
        await calculateDailySnapshot(date, staff.staffKey);
    }
}

/**
 * Recalculate metrics for all tickets that need updating.
 * Call this after LLM analysis completes.
 */
export async function recalculateAllTicketMetrics(): Promise<void> {
    const tickets = await db.select().from(factTickets);

    for (const ticket of tickets) {
        await updateTicketMetrics(ticket.ticketId);
    }
}
