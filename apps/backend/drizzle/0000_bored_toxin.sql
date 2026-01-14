CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text,
	`customer_name` text,
	`snippet` text,
	`updated_at` text,
	`message_count_total` integer DEFAULT 0,
	`last_analyzed_message_count` integer DEFAULT 0,
	`context_summary` text DEFAULT '',
	`last_analyzed_message_id` text,
	`last_analyzed_at` text,
	`full_json` text
);
--> statement-breakpoint
CREATE TABLE `dim_platform_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`color` text,
	`page_id` text,
	`last_synced_at` text
);
--> statement-breakpoint
CREATE TABLE `fact_analysis_queue` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`suggested_tag_ids` text,
	`suggested_assignee_id` text,
	`tags_applied` integer DEFAULT false,
	`assignment_applied` integer DEFAULT false,
	`created_at` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text,
	`sender_id` text,
	`sender_name` text,
	`content` text,
	`inserted_at` text,
	`is_from_shop` integer,
	`full_json` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
