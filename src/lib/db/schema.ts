import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import type { AutopilotState, Branding, ChannelProfile, VoiceOverride, VoiceSettings } from "@/lib/channel";
import type { IdeaEvaluation, Outline, FactCheck, Metadata, ProductBrief, StepKey } from "@/lib/types";

const now = () => new Date().toISOString();

export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  profile: text("profile", { mode: "json" }).$type<ChannelProfile>().notNull(),
  voiceId: text("voice_id"),
  voiceSettings: text("voice_settings", { mode: "json" }).$type<VoiceSettings>(),
  pronunciations: text("pronunciations", { mode: "json" })
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  characterRefPath: text("character_ref_path"),
  // Watermark settings; null means DEFAULT_BRANDING (off).
  branding: text("branding", { mode: "json" }).$type<Branding>(),
  // Picked channel art (profile picture 800x800, banner 2560x1440), for uploading to the platform.
  avatarPath: text("avatar_path"),
  bannerPath: text("banner_path"),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

export const ideas = sqliteTable("ideas", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull(),
  source: text("source", { enum: ["generated", "user"] }).notNull(),
  title: text("title").notNull(),
  angle: integer("angle"),
  hook: text("hook"),
  whyViral: text("why_viral"),
  score: real("score"),
  userNotes: text("user_notes"),
  evaluation: text("evaluation", { mode: "json" }).$type<IdeaEvaluation>(),
  starred: integer("starred", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull(),
  ideaId: text("idea_id"),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  angle: integer("angle"),
  hook: text("hook"),
  outline: text("outline", { mode: "json" }).$type<Outline>(),
  script: text("script"),
  factChecks: text("fact_checks", { mode: "json" }).$type<FactCheck[]>(),
  metadata: text("metadata", { mode: "json" }).$type<Metadata>(),
  approvals: text("approvals", { mode: "json" })
    .$type<Partial<Record<StepKey, string>>>()
    .notNull()
    .default({}),
  stale: text("stale", { mode: "json" }).$type<Partial<Record<StepKey, boolean>>>().notNull().default({}),
  // Timing
  pauseMs: integer("pause_ms").notNull().default(350),
  visualLeadMs: integer("visual_lead_ms").notNull().default(150),
  // Speeds the whole video up/down at render time (voice pitch preserved); 1 = as voiced.
  playbackRate: real("playback_rate").notNull().default(1),
  audioPath: text("audio_path"),
  audioDuration: real("audio_duration"),
  renderPath: text("render_path"),
  // One-click run through the steps; null = never run.
  autopilot: text("autopilot", { mode: "json" }).$type<AutopilotState>(),
  // A different voice or tone for this video only; null = the channel's voice.
  voiceOverride: text("voice_override", { mode: "json" }).$type<VoiceOverride>(),
  // Product-ad channels only: a snapshot of the product brief when the video was made (editing the
  // saved product later never changes this video). Null for long-form videos.
  product: text("product", { mode: "json" }).$type<ProductBrief>(),
  productId: text("product_id"),
  // "none" = silent, text-led ad: no Voice step, timings come from reading pace.
  voiceMode: text("voice_mode", { enum: ["voice", "none"] }).notNull().default("voice"),
  // Visual direction picked for this video so reuses of a product look different (product ads).
  variantHint: text("variant_hint"),
  createdAt: text("created_at").notNull().$defaultFn(now),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
});

/** Saved products of a product-ad channel, reused to make new videos. */
export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull(),
  name: text("name").notNull(),
  sellingPoints: text("selling_points", { mode: "json" }).$type<string[]>().notNull(),
  audience: text("audience"),
  cta: text("cta").notNull(),
  price: text("price"),
  // Under data/channels/<channelId>/products/<productId>/.
  imagePaths: text("image_paths", { mode: "json" }).$type<string[]>().notNull(),
  createdAt: text("created_at").notNull().$defaultFn(now),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
});

export const paragraphs = sqliteTable("paragraphs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  idx: integer("idx").notNull(),
  text: text("text").notNull(),
  audioPath: text("audio_path"),
  sampleCount: integer("sample_count"),
  sampleRate: integer("sample_rate"),
  // Per-sentence times relative to the start of this paragraph's audio.
  sentenceTimes: text("sentence_times", { mode: "json" }).$type<{ start: number; end: number }[]>(),
  voiceHash: text("voice_hash"),
  status: text("status", { enum: ["pending", "generating", "done", "error"] })
    .notNull()
    .default("pending"),
  error: text("error"),
});

export const sentences = sqliteTable("sentences", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  paragraphIdx: integer("paragraph_idx").notNull(),
  idx: integer("idx").notNull(), // global index across the script
  text: text("text").notNull(),
  // Absolute times in the stitched audio. Derived after voice generation.
  start: real("start"),
  end: real("end"),
});

export const scenes = sqliteTable("scenes", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  idx: integer("idx").notNull(),
  // Inclusive global sentence range. Scenes store sentence ids, never times.
  fromSentence: integer("from_sentence").notNull(),
  toSentence: integer("to_sentence").notNull(),
  frameType: text("frame_type").notNull(),
  background: text("background").notNull(),
  onScreenText: text("on_screen_text"),
  description: text("description").notNull(),
  nudgeMs: integer("nudge_ms").notNull().default(0),
  imagePath: text("image_path"),
  imageQuality: text("image_quality"),
  imageStatus: text("image_status", { enum: ["none", "queued", "generating", "done", "error"] })
    .notNull()
    .default("none"),
  imageError: text("image_error"),
  approved: integer("approved", { mode: "boolean" }).notNull().default(false),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  type: text("type").notNull(),
  status: text("status", { enum: ["running", "done", "error"] }).notNull(),
  progress: real("progress").notNull().default(0),
  message: text("message"),
  error: text("error"),
  // pid of the server process running the job; used to detect orphans after a restart.
  owner: integer("owner"),
  createdAt: text("created_at").notNull().$defaultFn(now),
  finishedAt: text("finished_at"),
});

/** Vertical 9:16 clips cut from a project's long video (reusing its voice and images). */
export const shorts = sqliteTable("shorts", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  // Inclusive global sentence range of the long video's narration.
  fromSentence: integer("from_sentence").notNull(),
  toSentence: integer("to_sentence").notNull(),
  title: text("title").notNull(),
  reason: text("reason"),
  // Post text for TikTok / Reels / Shorts.
  caption: text("caption"),
  hashtags: text("hashtags"),
  layout: text("layout", { enum: ["stacked", "fullscreen"] }).notNull().default("stacked"),
  // Playback speed of this Short (voice pitch kept); null = same as the long video.
  playbackRate: real("playback_rate"),
  // Consecutive parts made with "Make a series": shared id, 1-based part number and total.
  seriesId: text("series_id"),
  part: integer("part"),
  partsTotal: integer("parts_total"),
  renderPath: text("render_path"),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

/** Vertical images drawn for a Short's "fullscreen" layout; the long video's images are never touched. */
export const shortImages = sqliteTable("short_images", {
  id: text("id").primaryKey(),
  shortId: text("short_id").notNull(),
  sceneId: text("scene_id").notNull(),
  imagePath: text("image_path").notNull(),
});

/** Every rendered MP4 (long video or Short). The newest is the "current" one. */
export const renders = sqliteTable("renders", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  shortId: text("short_id"), // null = the long 16:9 video
  path: text("path").notNull(),
  srtPath: text("srt_path"),
  durationSec: real("duration_sec"),
  sizeBytes: integer("size_bytes"),
  options: text("options", { mode: "json" }).$type<Record<string, string | number | boolean>>(),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

/** Saved versions of a project's script and outline. */
export const textVersions = sqliteTable("text_versions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  kind: text("kind", { enum: ["script", "outline"] }).notNull(),
  content: text("content").notNull(), // outline stored as JSON
  source: text("source", { enum: ["ai", "edit", "rewrite", "restore", "initial"] }).notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

/** Values from the Settings page; they override .env.local. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const costs = sqliteTable("costs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: text("project_id"),
  provider: text("provider").notNull(),
  kind: text("kind").notNull(),
  usd: real("usd").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

export type Channel = typeof channels.$inferSelect;
export type Idea = typeof ideas.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Paragraph = typeof paragraphs.$inferSelect;
export type Sentence = typeof sentences.$inferSelect;
export type Scene = typeof scenes.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Short = typeof shorts.$inferSelect;
export type Render = typeof renders.$inferSelect;
export type TextVersion = typeof textVersions.$inferSelect;
