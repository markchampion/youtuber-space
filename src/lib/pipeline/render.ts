import "server-only";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { isAdChannel, onScreenFont, pacingOf, paletteHex, textColors, watermarkFor, type ChannelProfile } from "@/lib/channel";
import { needsImage } from "@/lib/ai/prompts/image";
import { absPath, mediaUrl, previewAudioUrl, previewImageUrl, projectRel, writeMedia } from "@/lib/media";
import { buildSrt, normalizeSceneRanges, sceneTimeline, shotTimeline } from "@/lib/sync";
import { renderLimit, startJob, type JobCtx } from "@/lib/jobs/queue";
import { recordRender } from "./history";
import type { AdProps, VideoProps } from "@/remotion/types";
import { getChannel, getProject, markStale, scenesOf, sentencesOf, updateProject } from "./common";

const FPS = 30;
/** How long the product-ad end card stays on after the voice. */
export const END_CARD_SECONDS = 2.5;

export type RenderOptions = { showCaptions: boolean; kenBurns: boolean };
/** `preview`: the Player in the browser gets downscaled images; the MP4 render keeps full-size ones. */
type PropsOptions = RenderOptions & { baseUrl?: string; preview?: boolean };

/** Flat color shown behind a scene while its image is missing (or during crossfades). */
export function backgroundColor(profile: ChannelProfile, key: string) {
  const known: Record<string, string> = {
    prehistoric: paletteHex(profile, "orange", "#F58220"),
    outdoor: paletteHex(profile, "sky blue", "#7FB5D5"),
    night: paletteHex(profile, "navy", "#283A6E"),
    deep_night: paletteHex(profile, "indigo", "#322B5E"),
    cave: paletteHex(profile, "cave", "#ABD3E5"),
  };
  return known[key] ?? textColors(profile).paper;
}

/** Single source of truth for timing, used by both the Player preview and the MP4 render. */
export function buildVideoProps(projectId: string, opts: PropsOptions): VideoProps {
  const p = getProject(projectId);
  const channel = getChannel(p.channelId);
  const profile = channel.profile;
  const sentences = sentencesOf(projectId);
  // Playback speed: every timestamp of the voiced audio is divided by the rate.
  const rate = p.playbackRate || 1;
  const duration = (p.audioDuration ?? Math.max(1, sentences.length * 3)) / rate;
  const starts = sentences.map((s, i) => (s.start ?? i * 3) / rate);
  const scenes = normalizeSceneRanges(scenesOf(projectId), sentences.length);
  const timeline = sceneTimeline(scenes, starts, duration, FPS, p.visualLeadMs);
  const abs = (u: string | null) => (u && opts.baseUrl ? opts.baseUrl + u : u);
  const img = (rel: string | null | undefined) => abs(opts.preview ? previewImageUrl(rel) : mediaUrl(rel));

  const { text, paper } = textColors(profile);
  const cameraCuts = pacingOf(profile).cameraCuts;
  const ad = isAdChannel(profile);

  return {
    fps: FPS,
    width: ad ? 1080 : 1920,
    height: ad ? 1920 : 1080,
    durationInFrames: Math.max(1, Math.round(duration * FPS)),
    audioUrl: abs((opts.preview ? previewAudioUrl : mediaUrl)(p.audioPath, p.audioDuration ?? undefined)),
    playbackRate: rate,
    scenes: scenes.map((s, k) => ({
      id: s.id,
      fromFrame: timeline[k].fromFrame,
      durationInFrames: timeline[k].durationInFrames,
      // Camera cut at every sentence inside the scene (free: same image, new framing).
      shots: cameraCuts ? shotTimeline(s, timeline[k], starts, FPS, p.visualLeadMs) : [{ fromFrame: 0, framing: "wide" as const }],
      imageUrl: img(s.imagePath),
      textOnly: !needsImage(profile, s),
      onScreenText: s.onScreenText,
      textPlacement: s.frameType === "label_on_object" ? "center" : "top",
      bgColor: backgroundColor(profile, s.background),
    })),
    captions: sentences
      .filter((s) => s.start != null && s.end != null)
      .map((s) => ({ text: s.text, fromFrame: Math.round((s.start! / rate) * FPS), toFrame: Math.round((s.end! / rate) * FPS) })),
    showCaptions: opts.showCaptions,
    kenBurns: opts.kenBurns,
    crossfadeFrames: 6,
    textColor: text,
    paperColor: paper,
    fontKey: onScreenFont(profile),
    watermark: watermarkFor(channel.branding, "long", abs(mediaUrl(channel.branding?.logoPath))),
  };
}

/** Product ad: the same timeline, vertical, with the end card added after the voice. */
export function buildAdProps(projectId: string, opts: PropsOptions): AdProps {
  const base = buildVideoProps(projectId, opts);
  const p = getProject(projectId);
  const profile = getChannel(p.channelId).profile;
  const abs = (u: string | null) => (u && opts.baseUrl ? opts.baseUrl + u : u);
  const img = (rel: string | null | undefined) => abs(opts.preview ? previewImageUrl(rel) : mediaUrl(rel));
  const tail = Math.round(END_CARD_SECONDS * FPS);
  return {
    ...base,
    durationInFrames: base.durationInFrames + tail,
    endCardFromFrame: base.durationInFrames,
    silent: p.voiceMode === "none",
    // No voice to speed up: reading pace is fixed.
    ...(p.voiceMode === "none" ? { audioUrl: null } : {}),
    endCard: {
      name: p.product?.name ?? p.title,
      price: p.product?.price ?? null,
      cta: p.product?.cta ?? "",
      imageUrl: img(p.product?.imagePaths[0]),
      accentColor: paletteHex(profile, "accent", "#E11D48"),
    },
  };
}

/** Props + composition for this project's kind: the long 16:9 video or the 9:16 product ad. */
export function buildRenderProps(projectId: string, opts: PropsOptions): { props: VideoProps | AdProps; compositionId: string } {
  const ad = isAdChannel(getChannel(getProject(projectId).channelId).profile);
  return ad ? { props: buildAdProps(projectId, opts), compositionId: "ProductAd" } : { props: buildVideoProps(projectId, opts), compositionId: "DoodleVideo" };
}

export function buildProjectSrt(projectId: string) {
  const rate = getProject(projectId).playbackRate || 1;
  return buildSrt(
    sentencesOf(projectId)
      .filter((s) => s.start != null && s.end != null)
      .map((s) => ({ text: s.text, start: s.start! / rate, end: s.end! / rate })),
  );
}

export const PLAYBACK_RATE_RANGE = { min: 0.8, max: 1.3 };

export function setTiming(projectId: string, values: { visualLeadMs?: number; playbackRate?: number }) {
  if (values.visualLeadMs != null) {
    updateProject(projectId, { visualLeadMs: Math.max(-500, Math.min(1000, Math.round(values.visualLeadMs))) });
  }
  if (values.playbackRate != null) {
    const r = Math.round(values.playbackRate * 100) / 100;
    updateProject(projectId, { playbackRate: Math.max(PLAYBACK_RATE_RANGE.min, Math.min(PLAYBACK_RATE_RANGE.max, r)) });
  }
  markStale(projectId, "render");
}

/** Render a composition in a child process (keeps webpack/Chromium out of Next), reporting progress. */
export function runRemotionRender(propsRel: string, outRel: string, compositionId: string, ctx: JobCtx) {
  fs.mkdirSync(path.dirname(absPath(outRel)), { recursive: true });
  return new Promise<void>((resolve, reject) => {
    // Run tsx's CLI with this Node directly: `.bin/tsx` is a .cmd shim on Windows, which spawn can't run without a shell.
    const tsx = path.resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");
    const child = spawn(process.execPath, [tsx, "scripts/render.ts", absPath(propsRel), absPath(outRel), compositionId], {
      cwd: process.cwd(),
      env: process.env,
    });
    let stderr = "";
    child.stdout.on("data", (buf: Buffer) => {
      for (const line of buf.toString().split("\n")) {
        const m = line.match(/^PROGRESS (\S+) (.*)$/);
        if (m) ctx.progress(Number(m[1]), m[2]);
      }
    });
    child.stderr.on("data", (b: Buffer) => (stderr = (stderr + b.toString()).slice(-4000)));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Render failed (exit ${code}): ${stderr.trim().slice(-800)}`))));
  });
}

export function startRenderJob(projectId: string, opts: RenderOptions & { baseUrl: string }) {
  const p = getProject(projectId);
  // Silent ads have no audio: their timing comes from reading pace (audioDuration is still set).
  if (p.voiceMode === "none" ? !p.audioDuration : !p.audioPath) throw new Error(p.voiceMode === "none" ? "Approve the script first" : "Generate the voice first");
  if (!scenesOf(projectId).length) throw new Error("Plan scenes first");

  return startJob(projectId, "render", async (ctx) => {
    const { props, compositionId } = buildRenderProps(projectId, opts);
    const propsRel = writeMedia(projectRel(projectId, "renders", "props.json"), Buffer.from(JSON.stringify(props)));
    const outRel = projectRel(projectId, "renders", `${p.slug || "video"}_${Date.now()}.mp4`);
    ctx.progress(0, "Waiting for a render slot");
    await renderLimit(() => runRemotionRender(propsRel, outRel, compositionId, ctx));

    const srtRel = writeMedia(outRel.replace(/\.mp4$/, ".srt"), Buffer.from(buildProjectSrt(projectId)));
    // Earlier renders are kept in the history; this one becomes current.
    updateProject(projectId, { renderPath: outRel });
    const cur = getProject(projectId);
    recordRender({
      projectId,
      path: outRel,
      srtPath: srtRel,
      durationSec: props.durationInFrames / props.fps,
      options: { speed: cur.playbackRate, captions: opts.showCaptions, kenBurns: opts.kenBurns, watermark: Boolean(props.watermark) },
    });
  });
}

