CREATE TABLE `renders` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`short_id` text,
	`path` text NOT NULL,
	`srt_path` text,
	`duration_sec` real,
	`size_bytes` integer,
	`options` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `text_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`source` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL
);
