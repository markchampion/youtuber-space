import "server-only";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { asc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { claudeJSON } from "@/lib/ai/claude";
import { CHANNEL_SYSTEM, analyzeTranscriptPrompt, draftChannelPrompt, rewriteSectionPrompt, type ProfileSection } from "@/lib/ai/prompts/channel";
import { DEFAULT_BRANDING, DEFAULT_LENGTH, DEFAULT_VOICE_SETTINGS, channelKind, type Branding, type ChannelKind, type ChannelProfile } from "@/lib/channel";
import { absPath, mediaUrl, writeMedia } from "@/lib/media";
import { ANCIENT_HUMANS_PROFILE } from "@/lib/channel-seed";
import { AD_STYLE_PRESETS, PRODUCT_AD_PROFILE } from "@/lib/channel-seed-ad";
import { normalizeProfile } from "@/lib/channel-normalize";
import { STYLE_PRESETS } from "@/lib/style-presets";
import { ChannelProfileSchema, TranscriptAnalysisSchema } from "@/lib/types";
import { transcriptStats } from "@/lib/sync";
import { DEFAULT_OUTLINE_TEMPLATE } from "@/lib/outline-templates";
import { getActiveChannel, getChannel, markStale, setActiveChannel } from "./common";

export function listChannels() {
  const active = getActiveChannel().id;
  const counts = new Map(
    db
      .select({ channelId: schema.projects.channelId, n: sql<number>`count(*)` })
      .from(schema.projects)
      .groupBy(schema.projects.channelId)
      .all()
      .map((r) => [r.channelId, r.n]),
  );
  return db
    .select()
    .from(schema.channels)
    .orderBy(asc(schema.channels.createdAt))
    .all()
    .map((c) => ({ id: c.id, name: c.name, avatarUrl: mediaUrl(c.avatarPath), kind: channelKind(c.profile), language: c.profile.language ?? "en", videos: counts.get(c.id) ?? 0, active: c.id === active }));
}

export type DraftInput = {
  kind?: ChannelKind;
  description: string;
  examples?: string;
  styleKey: string;
  customStyle?: string;
  tone?: string;
  language?: string;
  lengthMinutes?: { min: number; max: number };
};

/** Claude drafts a complete profile from a short description. Not saved until createChannel. */
export async function draftChannel(input: DraftInput): Promise<ChannelProfile> {
  if (!input.description.trim()) throw new Error("Describe your channel first");
  if (input.kind === "product_ad") return draftAdChannel(input);
  const style =
    input.styleKey === "custom"
      ? input.customStyle?.trim() || "Simple, clean illustration style"
      : (STYLE_PRESETS.find((s) => s.key === input.styleKey) ?? STYLE_PRESETS[0]).prompt;

  if (env.dryRun) {
    const name = input.description.split(/[.,\n]/)[0].slice(0, 40).trim() || "New channel";
    return normalizeProfile({
      ...ANCIENT_HUMANS_PROFILE,
      name,
      language: input.language,
      niche: input.description.trim(),
      lengthMinutes: input.lengthMinutes ?? DEFAULT_LENGTH,
      visual: { ...ANCIENT_HUMANS_PROFILE.visual, styleAnchor: style },
    });
  }
  const draft = await claudeJSON(ChannelProfileSchema, {
    system: CHANNEL_SYSTEM,
    user: draftChannelPrompt({ description: input.description, examples: input.examples, style, tone: input.tone, language: input.language }),
    effort: "high",
    kind: "channel_draft",
  });
  // Length is the creator's choice, never the AI's.
  return normalizeProfile({ ...draft, profileVersion: 2, language: input.language, lengthMinutes: input.lengthMinutes ?? DEFAULT_LENGTH });
}

/**
 * Product-ad channels start from a fixed, ad-tuned profile: the brief on each ad does the real work,
 * so there is nothing for Claude to draft (and nothing to pay for).
 */
function draftAdChannel(input: DraftInput): ChannelProfile {
  const style =
    input.styleKey === "custom"
      ? (input.customStyle?.trim() || AD_STYLE_PRESETS[0].prompt).replace(/[.;]?$/, ",")
      : (AD_STYLE_PRESETS.find((s) => s.key === input.styleKey) ?? AD_STYLE_PRESETS[0]).prompt;
  const name = input.description.split(/[.,\n]/)[0].slice(0, 40).trim() || "Product ads";
  return normalizeProfile({
    ...PRODUCT_AD_PROFILE,
    name,
    language: input.language,
    niche: input.description.trim(),
    voice: input.tone?.trim() ? `${input.tone.trim()}. ${PRODUCT_AD_PROFILE.voice}` : PRODUCT_AD_PROFILE.voice,
    visual: { ...PRODUCT_AD_PROFILE.visual, styleAnchor: style },
  });
}

/** Which profile fields each editor section owns. */
const SECTION_FIELDS: Record<ProfileSection, { top?: (keyof ChannelProfile)[]; visual?: (keyof ChannelProfile["visual"])[] }> = {
  // Never lengthMinutes, pacing or autopilot: those are the creator's settings, not something to rewrite.
  essentials: { top: ["name", "niche", "voice", "voiceSample"], visual: ["styleAnchor", "mainCharacter"] },
  angles: { top: ["topicAngles"] },
  story: { top: ["format", "evidenceRule", "extraScriptRules"] },
  visual: {
    visual: ["styleLock", "characterVariants", "conceptDevices", "palette", "textColor", "paperColor", "backgrounds", "frameTypes"],
  },
  metadata: { top: ["metadataRules"] },
  outline: { top: ["outlineTemplate"] },
};

/** Rewrite one section with an instruction. Returns the merged profile; nothing is saved. */
export async function rewriteSection(profile: ChannelProfile, section: ProfileSection, instruction: string): Promise<ChannelProfile> {
  if (!SECTION_FIELDS[section]) throw new Error("Unknown section");
  if (!instruction.trim()) throw new Error("Say how it should change");
  const result = env.dryRun
    ? { ...profile, topicAngles: [...profile.topicAngles, { id: 99, name: `(${instruction})`, template: `(${instruction})`, description: "DRY_RUN placeholder angle" }] }
    : await claudeJSON(ChannelProfileSchema, {
        system: CHANNEL_SYSTEM,
        user: rewriteSectionPrompt(profile, section, instruction),
        effort: "medium",
        kind: "channel_rewrite",
      });

  // Take only the section's fields from the result so nothing else can drift.
  const merged: ChannelProfile = { ...profile, visual: { ...profile.visual } };
  const f = SECTION_FIELDS[section];
  for (const k of f.top ?? []) (merged as Record<string, unknown>)[k] = (result as Record<string, unknown>)[k];
  for (const k of f.visual ?? []) (merged.visual as Record<string, unknown>)[k] = (result.visual as Record<string, unknown>)[k];
  return normalizeProfile(merged);
}

export function createChannel(profile: ChannelProfile) {
  const clean = normalizeProfile(profile);
  const id = nanoid(10);
  db.insert(schema.channels)
    .values({ id, name: clean.name, profile: clean, voiceSettings: DEFAULT_VOICE_SETTINGS, pronunciations: {} })
    .run();
  setActiveChannel(id);
  return id;
}

export function deleteChannel(id: string) {
  getChannel(id);
  const used = db.select({ n: sql<number>`count(*)` }).from(schema.projects).where(eq(schema.projects.channelId, id)).get()?.n ?? 0;
  if (used) throw new Error(`This channel has ${used} video(s). Delete them first.`);
  if (db.select({ n: sql<number>`count(*)` }).from(schema.channels).get()!.n <= 1) throw new Error("You need at least one channel");
  db.delete(schema.ideas).where(eq(schema.ideas.channelId, id)).run();
  db.delete(schema.channels).where(eq(schema.channels.id, id)).run();
  // If it was active, getActiveChannel() falls back to the oldest remaining channel.
}

// ---------- Branding / watermark ----------

const POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

/** Merge + validate branding, then flag this channel's rendered videos and Shorts for a re-render. */
export function saveBranding(channelId: string, patch: Partial<Branding>) {
  const c = getChannel(channelId);
  const cur = { ...DEFAULT_BRANDING, ...(c.branding ?? {}) };
  const next: Branding = {
    enabled: patch.enabled ?? cur.enabled,
    text: (patch.text ?? cur.text).slice(0, 40),
    logoPath: patch.logoPath !== undefined ? patch.logoPath : cur.logoPath,
    position: POSITIONS.includes(patch.position as Branding["position"]) ? (patch.position as Branding["position"]) : cur.position,
    opacity: Math.max(0.3, Math.min(1, Number(patch.opacity ?? cur.opacity) || 0.7)),
    onLongVideo: patch.onLongVideo ?? cur.onLongVideo,
    onShorts: patch.onShorts ?? cur.onShorts,
  };
  db.update(schema.channels).set({ branding: next }).where(eq(schema.channels.id, channelId)).run();
  for (const p of db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.channelId, channelId)).all()) {
    markStale(p.id, "render");
    markStale(p.id, "shorts");
  }
  return next;
}

/** Store an uploaded logo as a PNG (max 512 px tall, transparency kept). */
export async function setLogo(channelId: string, data: Buffer) {
  const png = await sharp(data).resize({ height: 512, withoutEnlargement: true }).png().toBuffer();
  const rel = writeMedia(path.posix.join("channels", channelId, `logo_${Date.now()}.png`), png);
  const old = getChannel(channelId).branding?.logoPath;
  saveBranding(channelId, { logoPath: rel });
  if (old) fs.rmSync(absPath(old), { force: true });
  return rel;
}

export function removeLogo(channelId: string) {
  const old = getChannel(channelId).branding?.logoPath;
  saveBranding(channelId, { logoPath: null });
  if (old) fs.rmSync(absPath(old), { force: true });
}

// ---------- Learn from a video you like ----------

/** Structure, techniques and a voice sample from a pasted transcript. Nothing is saved. */
export async function analyzeTranscript(profile: ChannelProfile, transcript: string) {
  if (transcript.trim().length < 500) throw new Error("Paste the full transcript (at least a few paragraphs).");
  const stats = transcriptStats(transcript, "en");
  if (env.dryRun) {
    return {
      stats,
      analysis: {
        template: { ...DEFAULT_OUTLINE_TEMPLATE, name: "Learned structure (DRY_RUN)" },
        techniques: ["Ask the viewer to guess before every reveal (DRY_RUN)."],
        voiceSample: profile.voiceSample ?? "",
      },
    };
  }
  const analysis = await claudeJSON(TranscriptAnalysisSchema, {
    system: CHANNEL_SYSTEM,
    user: analyzeTranscriptPrompt(profile, stats.text),
    effort: "high",
    kind: "channel_rewrite",
  });
  return { stats, analysis };
}
