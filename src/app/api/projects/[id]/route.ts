import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { baseUrlOf, handler } from "@/lib/api";
import { absPath, mediaUrl, projectRel } from "@/lib/media";
import { projectCliCalls, projectCost } from "@/lib/costs";
import { modelFor } from "@/lib/env";
import { CLAUDE_STEPS } from "@/lib/claude-models";
import { recentJobs, runningJobOf } from "@/lib/jobs/queue";
import { needsImage } from "@/lib/ai/prompts/image";
import { channelKind } from "@/lib/channel";
import { approveStep, getChannel, getProject, paragraphsOf, scenesOf, sentencesOf, updateProject } from "@/lib/pipeline/common";
import { deleteGeneratedVideos, deleteRender, generatedVideoBytes, listRenders, listVersions } from "@/lib/pipeline/history";
import { approveScript, restoreVersion, factCheck, generateOutline, rewriteParagraph, saveOutline, saveScript, setFactVerified } from "@/lib/pipeline/script";
import { paragraphsNeedingVoice, setPause, setVoiceOverride, startVoiceJob, makeVoiceChannelDefault } from "@/lib/pipeline/voice";
import { autopilotState, continueAutopilot, startAutopilot, stopAutopilot } from "@/lib/pipeline/autopilot";
import { mergeWithPrevious, scenePrompt, splitScene, startPlanScenesJob, updateScene } from "@/lib/pipeline/scenes";
import { approveAllImages, startImagesJob } from "@/lib/pipeline/images";
import { buildRenderProps, setTiming, startRenderJob } from "@/lib/pipeline/render";
import { generateAdScript, removeProductImage, setVoiceMode, shuffleVariant, updateBrief } from "@/lib/pipeline/product-ad";
import { generateMetadata, generateThumbnail, thumbnails } from "@/lib/pipeline/publish";
import {
  buildShortProps,
  createSeries,
  createShort,
  deleteShort,
  listShorts,
  startShortRenderJob,
  startVerticalImagesJob,
  suggestShorts,
  updateShort,
} from "@/lib/pipeline/shorts";
import type { StepKey } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/projects/[id]">;

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const project = getProject(id);
  const channel = getChannel(project.channelId);
  const sentences = sentencesOf(id);
  let needVoice: string[] = [];
  try {
    needVoice = paragraphsNeedingVoice(id).map((p) => p.id);
  } catch {
    // No voice picked yet.
  }
  return Response.json({
    project: { ...project, autopilot: autopilotState(id) },
    product: project.product ? { ...project.product, imageUrls: project.product.imagePaths.map((rel) => mediaUrl(rel)) } : null,
    channel: { id: channel.id, kind: channelKind(channel.profile), profile: channel.profile, voiceId: channel.voiceId, voiceSettings: channel.voiceSettings, pronunciations: channel.pronunciations, characterRefUrl: mediaUrl(channel.characterRefPath) },
    paragraphs: paragraphsOf(id).map((p) => ({
      ...p,
      audioUrl: mediaUrl(p.audioPath, p.voiceHash ?? undefined),
      needsVoice: needVoice.includes(p.id),
    })),
    sentences,
    scenes: scenesOf(id).map((s) => ({
      ...s,
      prompt: scenePrompt(id, s),
      imageUrl: mediaUrl(s.imagePath),
      needsImage: needsImage(channel.profile, s),
      start: sentences[s.fromSentence]?.start ?? null,
    })),
    audioUrl: mediaUrl(project.audioPath, project.audioDuration ?? undefined),
    renderUrl: mediaUrl(project.renderPath),
    renders: listRenders(id),
    generatedVideoBytes: generatedVideoBytes(id),
    shortRenders: Object.fromEntries(listShorts(id).map((s) => [s.id, listRenders(id, s.id)])),
    thumbnails: thumbnails(id).map((rel) => mediaUrl(rel)),
    shorts: listShorts(id),
    jobs: recentJobs(id),
    cost: projectCost(id),
    cliCalls: projectCliCalls(id),
    // Which Claude model each writing step will use, per the Settings preset.
    models: Object.fromEntries(CLAUDE_STEPS.map((s) => [s.key, modelFor(s.key)])),
  });
});

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  getProject(id);
  for (const s of listShorts(id)) deleteShort(s.id);
  for (const t of [schema.paragraphs, schema.sentences, schema.scenes, schema.jobs, schema.costs, schema.renders, schema.textVersions] as const) {
    db.delete(t).where(eq(t.projectId, id)).run();
  }
  db.delete(schema.projects).where(eq(schema.projects.id, id)).run();
  fs.rmSync(absPath(projectRel(id)), { recursive: true, force: true });
  return Response.json({ ok: true });
});

/** RPC-style actions for every pipeline step. */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await req.json();
  const ok = (extra: object = {}) => Response.json({ ok: true, ...extra });

  switch (b.action as string) {
    // Project
    case "rename":
      updateProject(id, { title: String(b.title) });
      return ok();
    case "approve":
      if (b.step === "script") approveScript(id);
      else approveStep(id, b.step as StepKey);
      if (b.step === "images") approveAllImages(id);
      return ok();

    // Script
    case "outline":
      return ok({ outline: await generateOutline(id, b.template) });
    case "saveOutline":
      saveOutline(id, b.outline);
      return ok();
    case "saveScript":
      saveScript(id, String(b.script ?? ""), b.source === "rewrite" ? "rewrite" : "edit", b.note);
      return ok();
    case "listVersions":
      return ok({ versions: listVersions(id, b.kind === "outline" ? "outline" : "script") });
    case "restoreVersion":
      restoreVersion(id, String(b.versionId));
      return ok();
    case "deleteGeneratedVideos": {
      if (runningJobOf(id, "render") || listShorts(id).some((s) => runningJobOf(id, `short:${s.id}`))) {
        throw new Error("A render is still running. Wait for it to finish, then clean up.");
      }
      return ok(deleteGeneratedVideos(id));
    }
    case "deleteRender":
      deleteRender(String(b.renderId));
      return ok();
    case "rewriteParagraph":
      return ok({ text: await rewriteParagraph(id, b.paragraph, b.instruction ?? "") });
    case "factCheck":
      return ok({ checks: await factCheck(id) });
    case "verifyFact":
      setFactVerified(id, Number(b.index), Boolean(b.verified));
      return ok();

    // Product ad
    case "adScript":
      return ok({ script: await generateAdScript(id, b.feedback) });
    case "updateBrief":
      return ok({ product: updateBrief(id, b.brief ?? {}) });
    case "removeProductImage":
      removeProductImage(id, String(b.path));
      return ok();
    case "setVoiceMode":
      setVoiceMode(id, b.mode === "none" ? "none" : "voice");
      return ok();
    case "shuffleVariant":
      return ok({ variantHint: shuffleVariant(id) });

    // Autopilot
    case "autopilot":
      return ok({ jobId: startAutopilot(id, baseUrlOf(req)) });
    case "autopilotContinue":
      return ok({ jobId: continueAutopilot(id, baseUrlOf(req)) });
    case "autopilotStop":
      stopAutopilot(id);
      return ok();
    case "revoice":
      // New voice, same pictures: re-voice what changed, then re-render. Scenes and images are kept.
      return ok({ jobId: startAutopilot(id, baseUrlOf(req), { from: "voice", config: { stopAfter: "render", pauseAfter: [] } }) });

    // Voice
    case "setVoiceOverride":
      setVoiceOverride(id, b.override ?? null);
      return ok();
    case "makeVoiceDefault":
      makeVoiceChannelDefault(id);
      return ok();
    case "voice":
      return ok({ jobId: startVoiceJob(id, b.paragraphIds) });
    case "setPause":
      setPause(id, Number(b.pauseMs));
      return ok();

    // Scenes
    case "planScenes":
      return ok({ jobId: startPlanScenesJob(id) });
    case "updateScene":
      updateScene(b.sceneId, b.values ?? {});
      return ok();
    case "splitScene":
      splitScene(b.sceneId, Number(b.atSentence));
      return ok();
    case "mergeScene":
      mergeWithPrevious(b.sceneId);
      return ok();

    // Images
    case "images":
      return ok({ jobId: startImagesJob(id, { sceneIds: b.sceneIds, quality: b.quality ?? "low", onlyMissing: b.onlyMissing }) });

    // Preview & render
    case "videoProps":
      return ok({ props: buildRenderProps(id, { showCaptions: Boolean(b.showCaptions), kenBurns: b.kenBurns !== false, preview: true }).props });
    case "setTiming":
      setTiming(id, { visualLeadMs: b.visualLeadMs, playbackRate: b.playbackRate });
      return ok();
    case "render":
      return ok({ jobId: startRenderJob(id, { showCaptions: Boolean(b.showCaptions), kenBurns: b.kenBurns !== false, baseUrl: baseUrlOf(req) }) });

    // Shorts
    case "suggestShorts":
      return ok({ ids: await suggestShorts(id, Number(b.count) || 3) });
    case "createSeries":
      return ok({ ids: await createSeries(id, { partSeconds: Number(b.partSeconds) || 60, maxParts: Number(b.maxParts) || null, speed: b.speed ? Number(b.speed) : null }) });
    case "createShort":
      return ok({ shortId: createShort(id, Number(b.fromSentence) || 0) });
    case "updateShort":
      updateShort(b.shortId, b.values ?? {});
      return ok();
    case "deleteShort":
      deleteShort(b.shortId);
      return ok();
    case "shortProps":
      return ok({ props: buildShortProps(b.shortId, undefined, { preview: true }) });
    case "renderShort":
      return ok({ jobId: startShortRenderJob(b.shortId, baseUrlOf(req)) });
    case "verticalImages":
      return ok({ jobId: startVerticalImagesJob(b.shortId, b.quality ?? "low") });

    // Publish
    case "metadata":
      return ok({ metadata: await generateMetadata(id) });
    case "thumbnail":
      return ok({ path: await generateThumbnail(id, String(b.concept)) });

    default:
      throw new Error(`Unknown action ${b.action}`);
  }
});
