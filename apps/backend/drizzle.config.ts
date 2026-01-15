import { defineConfig } from "drizzle-kit";

// Load shared root .env (monorepo) for drizzle-kit
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export default defineConfig({
    schema: ["./src/schema_operational.ts", "./src/schema_warehouse.ts"],
    out: "./drizzle",
    dialect: "sqlite",
    dbCredentials: {
        url: process.env.SQLITE_DB_PATH ?? "db/production.db",
    },
});
