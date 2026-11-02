CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`profile` text NOT NULL,
	`voice_id` text,
	`voice_settings` text,
	`pronunciations` text DEFAULT '{}' NOT NULL,
	`character_ref_path` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `costs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text,
	`provider` text NOT NULL,
	`kind` text NOT NULL,
	`usd` real NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`source` text NOT NULL,
	`title` text NOT NULL,
	`angle` integer,
	`hook` text,
	`why_viral` text,
	`score` real,
	`user_notes` text,
	`evaluation` text,
	`starred` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`message` text,
	`error` text,
	`created_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE TABLE `paragraphs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`idx` integer NOT NULL,
	`text` text NOT NULL,
	`audio_path` text,
	`sample_count` integer,
	`sample_rate` integer,
	`sentence_times` text,
	`voice_hash` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`idea_id` text,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`angle` integer,
	`hook` text,
	`outline` text,
	`script` text,
	`fact_checks` text,
	`metadata` text,
	`approvals` text DEFAULT '{}' NOT NULL,
	`stale` text DEFAULT '{}' NOT NULL,
	`pause_ms` integer DEFAULT 350 NOT NULL,
	`visual_lead_ms` integer DEFAULT 150 NOT NULL,
	`audio_path` text,
	`audio_duration` real,
	`render_path` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`idx` integer NOT NULL,
	`from_sentence` integer NOT NULL,
	`to_sentence` integer NOT NULL,
	`frame_type` text NOT NULL,
	`background` text NOT NULL,
	`on_screen_text` text,
	`description` text NOT NULL,
	`nudge_ms` integer DEFAULT 0 NOT NULL,
	`image_path` text,
	`image_quality` text,
	`image_status` text DEFAULT 'none' NOT NULL,
	`image_error` text,
	`approved` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sentences` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`paragraph_idx` integer NOT NULL,
	`idx` integer NOT NULL,
	`text` text NOT NULL,
	`start` real,
	`end` real
);
