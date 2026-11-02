CREATE TABLE `short_images` (
	`id` text PRIMARY KEY NOT NULL,
	`short_id` text NOT NULL,
	`scene_id` text NOT NULL,
	`image_path` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shorts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`from_sentence` integer NOT NULL,
	`to_sentence` integer NOT NULL,
	`title` text NOT NULL,
	`reason` text,
	`caption` text,
	`hashtags` text,
	`layout` text DEFAULT 'stacked' NOT NULL,
	`render_path` text,
	`created_at` text NOT NULL
);
