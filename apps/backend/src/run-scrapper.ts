import { runScraper } from "./scraper";

runScraper().catch((err) => {
  console.error("Scraper failed:", err);
  process.exit(1);
});