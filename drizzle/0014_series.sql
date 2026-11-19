CREATE TABLE `series` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`idea_id` text,
	`title` text NOT NULL,
	`premise` text NOT NULL,
	`episodes` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `series_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `episode` integer;