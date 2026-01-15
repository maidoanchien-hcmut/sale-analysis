// Load shared root .env (monorepo)
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { runScraper } from "./src/scraper";
import { analyticsRoutes } from "./src/analytics-routes";

// Configuration
const PYTHON_SERVICE_URL =
    process.env.PYTHON_SERVICE_URL ??
    process.env.PYTHON_API?.replace(/\/analyze$/, "") ??
    "http://localhost:8000";
const PORT = Number(process.env.BACKEND_PORT ?? process.env.PORT ?? 3000);

const app = new Elysia()
    .use(cors())
    .use(analyticsRoutes)

    // Health Check
    .get("/", () => ({ status: "Backend API is running", timestamp: new Date().toISOString() }))

    // Trigger the TypeScript Scraper (Pancake -> SQLite)
    // Runs asynchronously to prevent blocking the API request.
    .post("/control/scrape", async () => {
        console.log("Received manual scrape trigger...");

        setTimeout(() => {
            runScraper()
                .then(() => console.log("Scrape completed successfully."))
                .catch((err) => console.error("Scraper execution failed:", err));
        }, 0);

        return { message: "Scraper process started in background" };
    })

    // Trigger the Python analyzer service
    .post("/control/analyze", async () => {
        const url = `${PYTHON_SERVICE_URL.replace(/\/$/, "")}/trigger-analysis`;
        console.log(`Triggering Analyzer at ${url}...`);

        try {
            const response = await fetch(url, { method: "POST" });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Python service responded ${response.status}: ${errorText}`);
            }

            return await response.json();
        } catch (error: any) {
            console.error("Analyzer trigger failed:", error);
            return new Response(
                JSON.stringify({
                    error: "Failed to connect to LLM Engine",
                    details: error?.message ?? String(error),
                }),
                { status: 502, headers: { "Content-Type": "application/json" } }
            );
        }
    })

    // Convenience endpoint: run scraper first, then trigger analyzer
    .post("/control/scrape-and-analyze", async () => {
        console.log("Received scrape-and-analyze trigger...");

        try {
            await runScraper();
        } catch (err: any) {
            console.error("Scraper execution failed:", err);
            return new Response(
                JSON.stringify({
                    error: "Scraper failed",
                    details: err?.message ?? String(err),
                }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        const url = `${PYTHON_SERVICE_URL.replace(/\/$/, "")}/trigger-analysis`;

        try {
            const response = await fetch(url, { method: "POST" });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Python service responded ${response.status}: ${errorText}`);
            }
            return await response.json();
        } catch (error: any) {
            console.error("Analyzer trigger failed:", error);
            return new Response(
                JSON.stringify({
                    error: "Failed to connect to LLM Engine",
                    details: error?.message ?? String(error),
                }),
                { status: 502, headers: { "Content-Type": "application/json" } }
            );
        }
    })

    .listen(PORT);

console.log(`Backend API running at http://localhost:${PORT}`);
