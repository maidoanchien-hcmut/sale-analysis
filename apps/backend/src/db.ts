import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as operational from "./schema_operational";
import * as warehouse from "./schema_warehouse";

// Load shared root .env (monorepo)
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const sqliteDbPath = process.env.SQLITE_DB_PATH ?? "db/production.db";
const sqlite = new Database(sqliteDbPath);

export const db = drizzle(sqlite, {
    schema: {
        ...operational,
        ...warehouse,
    },
});
