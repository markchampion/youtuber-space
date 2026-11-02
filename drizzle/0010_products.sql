CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`name` text NOT NULL,
	`selling_points` text NOT NULL,
	`audience` text,
	`cta` text NOT NULL,
	`price` text,
	`image_paths` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `product_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `voice_mode` text DEFAULT 'voice' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `variant_hint` text;