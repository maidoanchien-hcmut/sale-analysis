import { sqlite } from "../db/index.js";

console.log("🧹 Cleaning database...\n");

// Get counts before cleaning
const beforeCounts = {
    conversations: (sqlite.query("SELECT COUNT(*) as count FROM conversations").get() as any).count,
    messages: (sqlite.query("SELECT COUNT(*) as count FROM messages").get() as any).count,
    customers: (sqlite.query("SELECT COUNT(*) as count FROM customers").get() as any).count,
    tags: (sqlite.query("SELECT COUNT(*) as count FROM tags").get() as any).count,
    conversationTags: (sqlite.query("SELECT COUNT(*) as count FROM conversation_tags").get() as any)
        .count,
    tickets: (sqlite.query("SELECT COUNT(*) as count FROM tickets").get() as any).count,
    riskFlags: (sqlite.query("SELECT COUNT(*) as count FROM risk_flags").get() as any).count,
    scraperRuns: (sqlite.query("SELECT COUNT(*) as count FROM scraper_runs").get() as any).count,
    llmAnalysisRuns: (sqlite.query("SELECT COUNT(*) as count FROM llm_analysis_runs").get() as any)
        .count,
};

console.log("Before cleaning:");
console.log(`  Conversations: ${beforeCounts.conversations}`);
console.log(`  Messages: ${beforeCounts.messages}`);
console.log(`  Customers: ${beforeCounts.customers}`);
console.log(`  Tags: ${beforeCounts.tags}`);
console.log(`  Conversation Tags: ${beforeCounts.conversationTags}`);
console.log(`  Tickets: ${beforeCounts.tickets}`);
console.log(`  Risk Flags: ${beforeCounts.riskFlags}`);
console.log(`  Scraper Runs: ${beforeCounts.scraperRuns}`);
console.log(`  LLM Analysis Runs: ${beforeCounts.llmAnalysisRuns}`);

// Clean all tables (order matters due to foreign keys)
console.log("\n🗑️  Deleting all data...");

sqlite.exec("DELETE FROM risk_flags");
sqlite.exec("DELETE FROM tickets");
sqlite.exec("DELETE FROM conversation_tags");
sqlite.exec("DELETE FROM messages");
sqlite.exec("DELETE FROM conversations");
sqlite.exec("DELETE FROM customers");
sqlite.exec("DELETE FROM tags");
sqlite.exec("DELETE FROM staff");
sqlite.exec("DELETE FROM llm_analysis_runs");
sqlite.exec("DELETE FROM scraper_runs");

// Reset auto-increment counters
sqlite.exec("DELETE FROM sqlite_sequence");

console.log("\n✅ Database cleaned!");
console.log("   All tables are now empty.");
console.log("   Auto-increment counters have been reset.");
