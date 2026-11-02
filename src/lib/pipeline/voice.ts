import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { env, sampleRateFromFormat } from "@/lib/env";
import { DEFAULT_VOICE_SETTINGS, pacingOf, type VoiceOverride } from "@/lib/channel";
import { synthesizeParagraph } from "@/lib/tts/elevenlabs";
import { pcmToWav, stitchPcm, wavPcm } from "@/lib/tts/wav";
import { absPath, projectRel, warmPreview, writeMedia } from "@/lib/media";
import { paragraphOffsets, wordCount } from "@/lib/sync";
import { normalizeProfile } from "@/lib/channel-normalize";
import { startJob } from "@/lib/jobs/queue";
import { getChannel, getProject, markChanged, paragraphsOf, sentencesOf, updateProject } from "./common";

/** The voice a project is read with: its own override if it has one, else the channel's. */
export function voiceConfig(projectId: string) {
  const p = getProject(projectId);
  const c = getChannel(p.channelId);
  const o = p.voiceOverride;
  const voiceId = o?.voiceId ?? c.voiceId ?? (env.dryRun ? "dry-run-voice" : null);
  if (!voiceId) throw new Error("Pick a voice first (Voice step → voice picker).");
  return {
    voiceId,
    settings: o?.settings ?? c.voiceSettings ?? DEFAULT_VOICE_SETTINGS,
    locale: c.profile.language ?? "en",
    pronunciations: c.pronunciations ?? {},
    format: env.elevenLabsOutputFormat,
  };
}

function hashFor(text: string, cfg: ReturnType<typeof voiceConfig>) {
  return crypto
    .createHash("sha1")
    // Language only joins the fingerprint when it isn't English, so existing English voices stay valid.
    .update(JSON.stringify([text, cfg.voiceId, cfg.settings, cfg.pronunciations, cfg.format, env.dryRun, ...(cfg.locale !== "en" ? [cfg.locale] : [])]))
    .digest("hex")
    .slice(0, 16);
}

/** Paragraphs that need (re)voicing because text, voice or settings changed. */
export function paragraphsNeedingVoice(projectId: string) {
  const cfg = voiceConfig(projectId);
  return paragraphsOf(projectId).filter((p) => p.status !== "done" || p.voiceHash !== hashFor(p.text, cfg));
}

/**
 * Voice all out-of-date paragraphs (or the given ones), then stitch.
 * Runs as a background job.
 */
export function startVoiceJob(projectId: string, onlyParagraphIds?: string[]) {
  return startJob(projectId, "voice", async (ctx) => {
    const cfg = voiceConfig(projectId);
    const all = paragraphsOf(projectId);
    if (!all.length) throw new Error("Approve the script first");
    const todo = onlyParagraphIds?.length
      ? all.filter((p) => onlyParagraphIds.includes(p.id))
      : all.filter((p) => p.status !== "done" || p.voiceHash !== hashFor(p.text, cfg));

    let reused = 0;
    for (const [n, para] of todo.entries()) {
      const hash = hashFor(para.text, cfg);
      // A take with exactly this text and voice was made before (e.g. switching back to an earlier tone): reuse it for free.
      const cached = readTake(projectId, para.id, hash);
      if (cached) {
        db.update(schema.paragraphs)
          .set({ status: "done", error: null, audioPath: cached.audioPath, sampleCount: cached.sampleCount, sampleRate: cached.sampleRate, sentenceTimes: cached.sentenceTimes, voiceHash: hash })
          .where(eq(schema.paragraphs.id, para.id))
          .run();
        reused++;
        continue;
      }
      ctx.progress(n / (todo.length + 1), `Voicing paragraph ${para.idx + 1} (${n + 1}/${todo.length})${reused ? `, ${reused} reused` : ""}`);
      db.update(schema.paragraphs).set({ status: "generating", error: null }).where(eq(schema.paragraphs.id, para.id)).run();
      try {
        const res = await synthesizeParagraph({
          text: para.text,
          voiceId: cfg.voiceId,
          settings: cfg.settings,
          pronunciations: cfg.pronunciations,
          previousText: all[para.idx - 1]?.text,
          nextText: all[para.idx + 1]?.text,
          projectId,
          locale: cfg.locale,
        });
        const rel = writeMedia(takePath(projectId, para.id, hash), pcmToWav(res.pcm, res.sampleRate));
        const take = { sampleCount: res.sampleCount, sampleRate: res.sampleRate, sentenceTimes: res.sentenceTimes };
        writeMedia(takePath(projectId, para.id, hash, "json"), Buffer.from(JSON.stringify(take)));
        db.update(schema.paragraphs)
          .set({ status: "done", audioPath: rel, ...take, voiceHash: hash })
          .where(eq(schema.paragraphs.id, para.id))
          .run();
      } catch (e) {
        db.update(schema.paragraphs)
          .set({ status: "error", error: e instanceof Error ? e.message : String(e) })
          .where(eq(schema.paragraphs.id, para.id))
          .run();
        throw e;
      }
    }
    ctx.progress(todo.length / (todo.length + 1), `Stitching audio${reused ? ` (${reused} paragraph${reused > 1 ? "s" : ""} reused from earlier takes)` : ""}`);
    stitch(projectId);
  });
}

/** Every take is kept under its voice fingerprint, so going back to an earlier voice or tone costs nothing. */
function takePath(projectId: string, paragraphId: string, hash: string, ext: "wav" | "json" = "wav") {
  return projectRel(projectId, "audio", `p_${paragraphId}_${hash}.${ext}`);
}

type Take = { audioPath: string; sampleCount: number; sampleRate: number; sentenceTimes: { start: number; end: number }[] };

function readTake(projectId: string, paragraphId: string, hash: string): Take | null {
  const wav = takePath(projectId, paragraphId, hash);
  const meta = takePath(projectId, paragraphId, hash, "json");
  if (!fs.existsSync(absPath(wav)) || !fs.existsSync(absPath(meta))) return null;
  try {
    const t = JSON.parse(fs.readFileSync(absPath(meta), "utf8"));
    if (!t.sampleCount || !t.sampleRate) return null;
    return { audioPath: wav, sampleCount: t.sampleCount, sampleRate: t.sampleRate, sentenceTimes: t.sentenceTimes ?? [] };
  } catch {
    return null;
  }
}

/**
 * Concatenate paragraph PCM with fixed pauses and derive absolute sentence
 * times from exact sample counts. Scenes follow automatically because they
 * reference sentences, not times.
 */
export function stitch(projectId: string) {
  const p = getProject(projectId);
  const paras = paragraphsOf(projectId);
  if (!paras.length || paras.some((x) => x.status !== "done" || !x.audioPath || !x.sampleCount)) return false;
  const rate = paras[0].sampleRate ?? sampleRateFromFormat(env.elevenLabsOutputFormat);
  if (paras.some((x) => x.sampleRate !== rate)) throw new Error("Paragraphs have mixed sample rates; regenerate all");

  const chunks = paras.map((x) => wavPcm(fs.readFileSync(absPath(x.audioPath!))));
  const pcm = stitchPcm(chunks, rate, p.pauseMs);
  const rel = writeMedia(projectRel(projectId, "audio", "voice.wav"), pcmToWav(pcm, rate));
  warmPreview(rel, "audio");
  const offsets = paragraphOffsets(
    paras.map((x) => x.sampleCount!),
    rate,
    p.pauseMs,
  );

  const sentences = sentencesOf(projectId);
  db.transaction((tx) => {
    const perPara = new Map<number, number>();
    for (const s of sentences) {
      const j = perPara.get(s.paragraphIdx) ?? 0;
      perPara.set(s.paragraphIdx, j + 1);
      const t = paras[s.paragraphIdx]?.sentenceTimes?.[j];
      const off = offsets[s.paragraphIdx] ?? 0;
      tx.update(schema.sentences)
        .set({ start: t ? off + t.start : null, end: t ? off + t.end : null })
        .where(eq(schema.sentences.id, s.id))
        .run();
    }
  });
  const duration = pcm.length / 2 / rate;
  updateProject(projectId, { audioPath: rel, audioDuration: duration });
  // A one-off voice for this video says nothing about the channel's usual speed.
  if (!p.voiceOverride?.voiceId && !p.voiceOverride?.settings) {
    recordSpeakingSpeed(p.channelId, paras.map((x) => x.text).join(" "), duration - (paras.length - 1) * (p.pauseMs / 1000));
  }
  markChanged(projectId, "voice");
  return true;
}

/**
 * Remember how fast the channel's voice really speaks, so length targets in minutes turn into the
 * right word counts. Free: it only uses the audio we already have.
 */
function recordSpeakingSpeed(channelId: string, text: string, speechSeconds: number) {
  const c = getChannel(channelId);
  const words = wordCount(text, c.profile.language ?? "en");
  if (words < 60 || speechSeconds < 20) return; // too little audio to be a reliable measurement
  const measuredWpm = Math.round(words / (speechSeconds / 60));
  if (c.profile.pacing?.measuredWpm === measuredWpm) return;
  const profile = normalizeProfile({ ...c.profile, pacing: { ...pacingOf(c.profile), measuredWpm } });
  db.update(schema.channels).set({ profile }).where(eq(schema.channels.id, channelId)).run();
}

/** Use a different voice or tone for this video only. null = back to the channel's voice. */
export function setVoiceOverride(projectId: string, override: VoiceOverride | null) {
  const clean = override && (override.voiceId || override.settings) ? { voiceId: override.voiceId ?? null, settings: override.settings ?? null } : null;
  updateProject(projectId, { voiceOverride: clean });
}

/** Make this video's voice the channel's, for every video, and drop the override. */
export function makeVoiceChannelDefault(projectId: string) {
  const p = getProject(projectId);
  const o = p.voiceOverride;
  if (!o) return;
  const c = getChannel(p.channelId);
  const voiceChanged = (o.voiceId && o.voiceId !== c.voiceId) || (o.settings && o.settings.speed !== c.voiceSettings?.speed);
  // A new voice or speed makes the measured speaking speed meaningless (same rule as the channel API).
  const profile = voiceChanged ? normalizeProfile({ ...c.profile, pacing: { ...pacingOf(c.profile), measuredWpm: undefined } }) : c.profile;
  db.update(schema.channels)
    .set({ voiceId: o.voiceId ?? c.voiceId, voiceSettings: o.settings ?? c.voiceSettings, profile })
    .where(eq(schema.channels.id, c.id))
    .run();
  updateProject(projectId, { voiceOverride: null });
}

export function setPause(projectId: string, pauseMs: number) {
  updateProject(projectId, { pauseMs: Math.max(0, Math.min(2000, Math.round(pauseMs))) });
  stitch(projectId);
}
