import "server-only";
import fs from "node:fs";
import { and, asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { claudeJSON } from "@/lib/ai/claude";
import { channelBrief, seriesPrompt, shortsPrompt } from "@/lib/ai/prompts";
import { buildImagePrompt, needsImage } from "@/lib/ai/prompts/image";
import { onScreenFont, pacingOf, textColors, watermarkFor } from "@/lib/channel";
import { readableOn } from "@/lib/color";
import { imageProvider, type ImageQuality } from "@/lib/image/provider";
import { absPath, mediaUrl, previewAudioUrl, previewImageUrl, projectRel, warmPreview, writeMedia } from "@/lib/media";
import { imageLimit, startJob } from "@/lib/jobs/queue";
import {
  SHORT_MAX_SECONDS,
  captionChunks,
  clampClip,
  clipAtSpeed,
  clipSceneTimeline,
  clipWindow,
  normalizeSceneRanges,
  seriesSplit,
  shotTimeline,
  type ClipRange,
} from "@/lib/sync";
import { SeriesTextSchema, ShortSuggestionsSchema } from "@/lib/types";
import type { ShortProps } from "@/remotion/types";
import { getChannel, getProject, markChanged, scenesOf, sentencesOf } from "./common";
import { PLAYBACK_RATE_RANGE, backgroundColor, runRemotionRender } from "./render";
import { deleteAllRenders, recordRender } from "./history";

const FPS = 30;

function getShort(id: string) {
  const s = db.select().from(schema.shorts).where(eq(schema.shorts.id, id)).get();
  if (!s) throw new Error("Short not found");
  return s;
}

/** Sentence times of the long narration; Shorts need the voice to exist. */
function timings(projectId: string) {
  const p = getProject(projectId);
  const sentences = sentencesOf(projectId);
  const audioDuration = p.audioDuration;
  if (!p.audioPath || !audioDuration || sentences.some((s) => s.start == null || s.end == null)) {
    throw new Error("Generate the voice first. Shorts reuse the long video's narration.");
  }
  return {
    project: p,
    sentences,
    starts: sentences.map((s) => s.start!),
    ends: sentences.map((s) => s.end!),
    audioDuration,
  };
}

/** The speed a Short plays at: its own, or the long video's. */
function speedOf(short: { playbackRate: number | null }, project: { playbackRate: number }) {
  return short.playbackRate ?? (project.playbackRate || 1);
}

export function listShorts(projectId: string) {
  const rows = db
    .select()
    .from(schema.shorts)
    .where(eq(schema.shorts.projectId, projectId))
    .orderBy(asc(schema.shorts.createdAt), asc(schema.shorts.part))
    .all();
  const imgs = rows.length
    ? db.select().from(schema.shortImages).where(inArray(schema.shortImages.shortId, rows.map((r) => r.id))).all()
    : [];
  let t: ReturnType<typeof timings> | null = null;
  try {
    t = timings(projectId);
  } catch {
    // No voice yet: durations unknown.
  }
  const scenes = scenesOf(projectId);
  const profile = getChannel(getProject(projectId).channelId).profile;
  const project = getProject(projectId);
  return rows.map((s) => {
    const speed = speedOf(s, project);
    const inClip = scenes.filter((sc) => sc.toSentence >= s.fromSentence && sc.fromSentence <= s.toSentence && needsImage(profile, sc));
    const drawn = new Set(imgs.filter((i) => i.shortId === s.id).map((i) => i.sceneId));
    return {
      ...s,
      speed,
      duration: t ? clipWindow(s, t.starts, t.ends, t.audioDuration).duration / speed : null,
      renderUrl: mediaUrl(s.renderPath),
      verticalNeeded: inClip.length,
      verticalDone: inClip.filter((sc) => drawn.has(sc.id)).length,
    };
  });
}

/** Claude picks the best stand-alone 30–60 s moments. Adds them to the project's Shorts. */
export async function suggestShorts(projectId: string, count = 3) {
  const t = timings(projectId);
  const channel = getChannel(t.project.channelId);
  const numbered = t.sentences.map((s, i) => `${i} [${t.starts[i].toFixed(1)}s]: ${s.text}`).join("\n");

  const result = env.dryRun
    ? {
        shorts: [0, 0.4, 0.7].slice(0, count).map((f, k) => {
          const from = Math.floor(t.sentences.length * f);
          return {
            fromSentence: from,
            toSentence: from + 4,
            title: ["Nobody woke you up", "300,000 years of this", "Farming was a trap"][k],
            reason: "DRY_RUN placeholder clip.",
            caption: "What if your morning looked like this? (DRY_RUN)",
            hashtags: ["#history", "#ancienthumans", "#didyouknow", "#shorts"],
          };
        }),
      }
    : await claudeJSON(ShortSuggestionsSchema, {
        system: channelBrief(channel.profile),
        user: shortsPrompt(numbered, count),
        effort: "medium",
        kind: "shorts",
        projectId,
      });

  const rows = result.shorts.map((s) => {
    const clip = clampClip(s, t.starts, t.ends);
    return {
      id: nanoid(10),
      projectId,
      ...clip,
      title: s.title.trim(),
      reason: s.reason,
      caption: s.caption,
      hashtags: s.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "),
    };
  });
  if (rows.length) db.insert(schema.shorts).values(rows).run();
  return rows.map((r) => r.id);
}

/** A hand-picked clip, starting at `fromSentence` and grown to ~30 s. */
export function createShort(projectId: string, fromSentence = 0) {
  const t = timings(projectId);
  const clip = clampClip({ fromSentence, toSentence: fromSentence }, t.starts, t.ends, 30, 60);
  const id = nanoid(10);
  db.insert(schema.shorts)
    .values({ id, projectId, ...clip, title: t.sentences[clip.fromSentence].text.split(/\s+/).slice(0, 6).join(" ") })
    .run();
  return id;
}

/**
 * Consecutive parts that cover the video in order (Part 1, Part 2, …), each about `partSeconds` long on screen.
 * `speed` null = same as the long video. Titles and captions come from one Claude call.
 */
export async function createSeries(projectId: string, opts: { partSeconds: number; maxParts?: number | null; speed?: number | null }) {
  const t = timings(projectId);
  const channel = getChannel(t.project.channelId);
  const speed = opts.speed ? Math.max(PLAYBACK_RATE_RANGE.min, Math.min(PLAYBACK_RATE_RANGE.max, opts.speed)) : null;
  const rate = speed ?? (t.project.playbackRate || 1);
  const partSeconds = Math.max(15, Math.min(SHORT_MAX_SECONDS, Number(opts.partSeconds) || 60));
  const ranges = seriesSplit(
    t.sentences.map((s, i) => ({ start: t.starts[i], end: t.ends[i], paragraphIdx: s.paragraphIdx, text: s.text })),
    // Lengths are on-screen seconds; at 1.2× a part holds 1.2× as much narration.
    { partSeconds: partSeconds * rate, maxParts: opts.maxParts || null, maxSeconds: SHORT_MAX_SECONDS * rate },
  );
  if (!ranges.length) throw new Error("Nothing to split");
  const n = ranges.length;
  const texts = ranges.map((r) => t.sentences.slice(r.fromSentence, r.toSentence + 1).map((s) => s.text).join(" "));

  const result = env.dryRun
    ? {
        parts: ranges.map((_, i) => ({
          title: `${t.project.title.split(/\s+/).slice(0, 4).join(" ")} (DRY_RUN)`,
          caption: i < n - 1 ? `Placeholder caption. Part ${i + 1}/${n}, part ${i + 2} next` : `Placeholder caption. Part ${n}/${n}, full video on the channel`,
          hashtags: ["#history", "#shorts", "#series"],
        })),
      }
    : await claudeJSON(SeriesTextSchema, {
        system: channelBrief(channel.profile),
        user: seriesPrompt(texts),
        effort: "medium",
        kind: "shorts",
        projectId,
      });

  const seriesId = nanoid(10);
  const createdAt = new Date().toISOString();
  const rows = ranges.map((r, i) => {
    const text = result.parts[i];
    return {
      id: nanoid(10),
      projectId,
      ...r,
      title: text?.title.trim() || texts[i].split(/\s+/).slice(0, 6).join(" "),
      caption: text?.caption ?? null,
      hashtags: text ? text.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ") : null,
      playbackRate: speed,
      seriesId,
      part: i + 1,
      partsTotal: n,
      createdAt,
    };
  });
  db.insert(schema.shorts).values(rows).run();
  return rows.map((r) => r.id);
}

export function updateShort(
  id: string,
  values: Partial<Pick<typeof schema.shorts.$inferInsert, "title" | "fromSentence" | "toSentence" | "layout" | "caption" | "hashtags" | "playbackRate">>,
) {
  const s = getShort(id);
  if ("playbackRate" in values && values.playbackRate != null) {
    values = { ...values, playbackRate: Math.max(PLAYBACK_RATE_RANGE.min, Math.min(PLAYBACK_RATE_RANGE.max, Math.round(Number(values.playbackRate) * 100) / 100)) };
  }
  const next = { ...s, ...values };
  const n = sentencesOf(s.projectId).length;
  if (next.fromSentence < 0 || next.toSentence >= n || next.fromSentence > next.toSentence) throw new Error("Invalid clip range");
  const visual = ["title", "fromSentence", "toSentence", "layout", "playbackRate"].some((k) => k in values);
  db.update(schema.shorts)
    .set({ ...values, ...(visual ? { renderPath: null } : {}) }) // old render stays in history
    .where(eq(schema.shorts.id, id))
    .run();
}

export function deleteShort(id: string) {
  const s = getShort(id);
  const imgs = db.select().from(schema.shortImages).where(eq(schema.shortImages.shortId, id)).all();
  for (const f of imgs.map((i) => i.imagePath)) fs.rmSync(absPath(f), { force: true });
  deleteAllRenders(s.projectId, id);
  db.delete(schema.shortImages).where(eq(schema.shortImages.shortId, id)).run();
  db.delete(schema.shorts).where(eq(schema.shorts.id, id)).run();
}

/**
 * Same sync rules as the long video, shifted so the clip starts at frame 0.
 * `preview`: the phone-sized Player gets 480px images and AAC audio; the MP4 render keeps the originals.
 */
export function buildShortProps(id: string, baseUrl?: string, opts: { preview?: boolean } = {}): ShortProps {
  const short = getShort(id);
  const t = timings(short.projectId);
  const channel = getChannel(t.project.channelId);
  const profile = channel.profile;
  const clip: ClipRange = short;
  const rate = speedOf(short, t.project);
  // Every time below is in output seconds (narration time ÷ speed), like the long video's playback speed.
  const timed = clipAtSpeed(clip, t.starts, t.ends, t.audioDuration, rate, FPS);
  const { win, starts, ends } = timed;
  const scenes = normalizeSceneRanges(scenesOf(short.projectId), t.sentences.length);
  const timeline = clipSceneTimeline(scenes, clip, starts, win, FPS, t.project.visualLeadMs);
  const vertical = new Map(
    db.select().from(schema.shortImages).where(eq(schema.shortImages.shortId, id)).all().map((i) => [i.sceneId, i.imagePath]),
  );
  const abs = (u: string | null) => (u && baseUrl ? baseUrl + u : u);
  const img = (rel: string | null | undefined) => abs(opts.preview ? previewImageUrl(rel, 480) : mediaUrl(rel));
  const { text, paper } = textColors(profile);

  const captions = t.sentences
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => i >= clip.fromSentence && i <= clip.toSentence)
    .flatMap(({ s, i }) => captionChunks(s.text, starts[i] - win.start, ends[i] - win.start, 3, profile.language))
    .map((c) => ({ text: c.text, fromFrame: Math.round(c.start * FPS), toFrame: Math.round(c.end * FPS) }));

  return {
    fps: FPS,
    width: 1080,
    height: 1920,
    durationInFrames: timed.durationInFrames,
    audioUrl: abs((opts.preview ? previewAudioUrl : mediaUrl)(t.project.audioPath, t.audioDuration)),
    audioTrimBefore: timed.trimBefore,
    audioTrimAfter: timed.trimAfter,
    playbackRate: rate,
    title: short.title,
    partLabel: short.part && short.partsTotal ? `PART ${short.part}/${short.partsTotal}` : null,
    endNote: !short.part || !short.partsTotal ? null : short.part < short.partsTotal ? `Part ${short.part + 1} next →` : "Full video on the channel",
    layout: short.layout,
    scenes: timeline.map(({ scene, timing }) => ({
      id: scene.id,
      fromFrame: timing.fromFrame,
      durationInFrames: timing.durationInFrames,
      shots: pacingOf(profile).cameraCuts
        ? shotTimeline({ ...scene, fromSentence: Math.max(scene.fromSentence, clip.fromSentence), toSentence: Math.min(scene.toSentence, clip.toSentence) }, timing, starts.map((x) => x - win.start), FPS, t.project.visualLeadMs)
        : [{ fromFrame: 0, framing: "wide" as const }],
      imageUrl: img(scene.imagePath),
      verticalImageUrl: img(vertical.get(scene.id)),
      textOnly: !needsImage(profile, scene),
      onScreenText: scene.onScreenText,
      bgColor: backgroundColor(profile, scene.background),
    })),
    captions,
    crossfadeFrames: 6,
    textColor: text,
    paperColor: paper,
    captionColor: profile.visual.captionColor ?? readableOn(paper),
    fontKey: onScreenFont(profile),
    watermark: watermarkFor(channel.branding, "short", abs(mediaUrl(channel.branding?.logoPath))),
  };
}

export function startShortRenderJob(id: string, baseUrl: string) {
  const short = getShort(id);
  return startJob(short.projectId, `short:${id}`, async (ctx) => {
    const props = buildShortProps(id, baseUrl);
    const propsRel = writeMedia(projectRel(short.projectId, "shorts", `${id}.json`), Buffer.from(JSON.stringify(props)));
    const slug = short.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "short";
    const outRel = projectRel(short.projectId, "shorts", `${slug}_${Date.now()}.mp4`);
    await runRemotionRender(propsRel, outRel, "DoodleShort", ctx);
    // Earlier renders stay in the history; this one becomes current.
    db.update(schema.shorts).set({ renderPath: outRel }).where(eq(schema.shorts.id, id)).run();
    recordRender({
      projectId: short.projectId,
      shortId: id,
      path: outRel,
      durationSec: props.durationInFrames / props.fps,
      options: { layout: props.layout, watermark: Boolean(props.watermark) },
    });
    markChanged(short.projectId, "shorts");
  });
}

/** Scenes in the clip that still need a vertical (9:16) image. */
function scenesNeedingVertical(id: string) {
  const short = getShort(id);
  const profile = getChannel(getProject(short.projectId).channelId).profile;
  const done = new Set(db.select().from(schema.shortImages).where(eq(schema.shortImages.shortId, id)).all().map((i) => i.sceneId));
  return scenesOf(short.projectId).filter(
    (sc) => sc.toSentence >= short.fromSentence && sc.fromSentence <= short.toSentence && needsImage(profile, sc) && !done.has(sc.id),
  );
}

/** Redraw only this clip's scenes as full-screen 9:16 images, then switch the Short to the fullscreen layout. */
export function startVerticalImagesJob(id: string, quality: ImageQuality) {
  const short = getShort(id);
  const channel = getChannel(getProject(short.projectId).channelId);
  const profile = channel.profile;
  const todo = scenesNeedingVertical(id);
  if (!todo.length) throw new Error("All scenes in this Short already have vertical images");
  return startJob(short.projectId, `short:${id}`, async (ctx) => {
    const ref = channel.characterRefPath ? [absPath(channel.characterRefPath)] : [];
    let done = 0;
    await Promise.all(
      todo.map((scene) =>
        imageLimit(async () => {
          const png = await imageProvider().generate({
            prompt: buildImagePrompt(profile, scene, "portrait"),
            quality,
            referencePaths: ref,
            projectId: short.projectId,
            orientation: "portrait",
          });
          const rel = writeMedia(projectRel(short.projectId, "shorts", "images", `${id}_${scene.id}.png`), png);
          // Only the phone-sized Shorts preview shows these.
          warmPreview(rel, "image", [480]);
          db.delete(schema.shortImages)
            .where(and(eq(schema.shortImages.shortId, id), eq(schema.shortImages.sceneId, scene.id)))
            .run();
          db.insert(schema.shortImages).values({ id: nanoid(10), shortId: id, sceneId: scene.id, imagePath: rel }).run();
          ctx.progress(++done / todo.length, `${done}/${todo.length} vertical images`);
        }),
      ),
    );
    updateShort(id, { layout: "fullscreen" });
  });
}
