import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema.js";

export const sqlite = new Database("customer_service_qa.db");
export const db = drizzle(sqlite, { schema });

// Database is initialized via drizzle-kit migrations
// Run: bunx drizzle-kit generate && bunx drizzle-kit migrate
export async function initializeDatabase() {
    console.log("Database connected successfully");
}
