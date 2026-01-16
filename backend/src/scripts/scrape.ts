import { Scraper } from "../services/scraper.js";
import { initializeDatabase } from "../db/index.js";

// Load .env from root folder
const envPath = "../.env";
const envFile = Bun.file(envPath);
if (await envFile.exists()) {
    const envContent = await envFile.text();
    for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
            const [key, ...valueParts] = trimmed.split("=");
            if (key && valueParts.length > 0) {
                let value = valueParts.join("=").trim();
                // Remove surrounding quotes if present
                if (
                    (value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))
                ) {
                    value = value.slice(1, -1);
                }
                process.env[key.trim()] = value;
            }
        }
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
let fromDate = args[0] || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // Default: 7 days ago
let toDate = args[1] || new Date().toISOString().slice(0, 10); // Default: today

// Get environment variables
const PAGE_ID = process.env.PAGE_ID;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

if (!PAGE_ID || !PAGE_ACCESS_TOKEN) {
    console.error("Error: PAGE_ID and PAGE_ACCESS_TOKEN environment variables are required");
    console.error(
        "Make sure you have a .env file with these values or set them in your environment"
    );
    process.exit(1);
}

console.log(`Scraping conversations from ${fromDate} to ${toDate}`);
console.log(`Page ID: ${PAGE_ID}`);

// Initialize database first
await initializeDatabase();

// Create and run scraper
const scraper = new Scraper({
    pageId: PAGE_ID,
    pageAccessToken: PAGE_ACCESS_TOKEN,
    fromDate,
    toDate,
});

try {
    const result = await scraper.scrape();
    console.log(`\nScraping completed!`);
    console.log(`Conversations scraped: ${result.conversationsScraped}`);
    console.log(`Messages scraped: ${result.messagesScraped}`);
} catch (error) {
    console.error("Scraping failed:", error);
    process.exit(1);
}
