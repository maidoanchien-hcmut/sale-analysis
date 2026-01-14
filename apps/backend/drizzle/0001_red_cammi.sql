CREATE TABLE `dim_customer` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`platform` text
);
--> statement-breakpoint
CREATE TABLE `dim_date` (
	`date_id` integer PRIMARY KEY NOT NULL,
	`full_date` text,
	`year` integer,
	`month` integer,
	`day` integer,
	`day_of_week` integer
);
--> statement-breakpoint
CREATE TABLE `dim_staff` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`fb_id` text,
	`role` text,
	`is_active` integer
);
--> statement-breakpoint
CREATE TABLE `dim_time` (
	`hour_id` integer PRIMARY KEY NOT NULL,
	`label` text
);
--> statement-breakpoint
CREATE TABLE `fact_chat_audit` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`primary_staff_id` text,
	`customer_id` text,
	`date_id` integer,
	`sentiment_label` text,
	`risk_level` text,
	`rep_quality` text,
	`user_intent` text,
	`competitors_mentioned` text,
	`audit_evidence_json` text,
	`updated_at` text,
	FOREIGN KEY (`primary_staff_id`) REFERENCES `dim_staff`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `dim_customer`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`date_id`) REFERENCES `dim_date`(`date_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `fact_staff_hourly_stat` (
	`staff_id` text NOT NULL,
	`date_id` integer NOT NULL,
	`hour_id` integer NOT NULL,
	`avg_response_time_ms` integer,
	`inbox_count` integer,
	`unique_inbox_count` integer,
	`comment_count` integer,
	`phone_count` integer,
	PRIMARY KEY(`staff_id`, `date_id`, `hour_id`),
	FOREIGN KEY (`staff_id`) REFERENCES `dim_staff`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`date_id`) REFERENCES `dim_date`(`date_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`hour_id`) REFERENCES `dim_time`(`hour_id`) ON UPDATE no action ON DELETE no action
);
