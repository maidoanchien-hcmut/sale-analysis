/**
 * Clean analysis tables (tickets, risk_flags, staff, llm_analysis_runs)
 * Preserves scraped data (conversations, messages, customers, tags)
 */

import { Database } from "bun:sqlite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = resolve(__dirname, "../../customer_service_qa.db");

console.log("🧹 Cleaning analysis tables...");
console.log(`📁 Database: ${dbPath}`);

const db = new Database(dbPath);

// Get counts before cleaning
const ticketCount = db.query("SELECT COUNT(*) as count FROM tickets").get() as { count: number };
const riskFlagCount = db.query("SELECT COUNT(*) as count FROM risk_flags").get() as {
    count: number;
};
const staffCount = db.query("SELECT COUNT(*) as count FROM staff").get() as { count: number };
const runCount = db.query("SELECT COUNT(*) as count FROM llm_analysis_runs").get() as {
    count: number;
};

console.log("\n📊 Current counts:");
console.log(`   Tickets: ${ticketCount.count}`);
console.log(`   Risk Flags: ${riskFlagCount.count}`);
console.log(`   Staff: ${staffCount.count}`);
console.log(`   LLM Analysis Runs: ${runCount.count}`);

// Clean tables in order (respect foreign keys)
console.log("\n🗑️ Deleting data...");

// 1. Delete risk_flags first (references tickets and messages)
db.run("DELETE FROM risk_flags");
console.log("   ✅ risk_flags cleared");

// 2. Delete tickets (references conversations, staff, messages)
db.run("DELETE FROM tickets");
console.log("   ✅ tickets cleared");

// 3. Delete staff
db.run("DELETE FROM staff");
console.log("   ✅ staff cleared");

// 4. Delete llm_analysis_runs
db.run("DELETE FROM llm_analysis_runs");
console.log("   ✅ llm_analysis_runs cleared");

// 5. Reset message flags
db.run("UPDATE messages SET is_auto_reply = 0, has_risk_flag = 0");
console.log("   ✅ message flags reset");

// Reset auto-increment counters
db.run("DELETE FROM sqlite_sequence WHERE name IN ('tickets', 'risk_flags', 'llm_analysis_runs')");
console.log("   ✅ auto-increment counters reset");

db.close();

console.log("\n✅ Analysis tables cleaned successfully!");
console.log("   Scraped data (conversations, messages, customers, tags) preserved.");
