import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { claudeJSON } from "@/lib/ai/claude";
import { channelBrief, scenesPrompt } from "@/lib/ai/prompts";
import { buildImagePrompt } from "@/lib/ai/prompts/image";
import { adBrief, adScenesPrompt } from "@/lib/ai/prompts/ad";
import { isAdChannel } from "@/lib/channel";
import { previousVideos } from "./products";
import { ScenePlanSchema, type ScenePlan } from "@/lib/types";
import { normalizeSceneRanges } from "@/lib/sync";
import { claudeLimit, startJob } from "@/lib/jobs/queue";
import { getChannel, getProject, markChanged, markStale, scenesOf, sentencesOf, updateProject } from "./common";

function dryPlan(n: number): ScenePlan {
  const scenes: ScenePlan["scenes"] = [];
  const bgs = ["prehistoric", "outdoor", "neutral", "night", "deep_night", "hardship"];
  for (let i = 0, k = 0; i < n; k++) {
    const to = Math.min(n - 1, i + (k % 3));
    const textOnly = k % 5 === 1;
    scenes.push({
      fromSentence: i,
      toSentence: to,
      frameType: textOnly ? "concept_text" : "character_scene",
      background: textOnly ? "neutral" : bgs[k % bgs.length],
      onScreenText: textOnly ? "300,000 YEARS" : "",
      description: "The orange-haired stick figure (spiky orange hair, round white head) stretches and smiles beside a small campfire.",
    });
    i = to + 1;
  }
  return { scenes };
}

/** Ads: one scene per sentence, cycling through the ad frame types. */
function dryAdPlan(n: number, direction: string | null): ScenePlan {
  const frames = ["product_hero", "in_use", "detail_closeup", "lifestyle"];
  const bgs = ["studio", "lifestyle", "neutral", "lifestyle"];
  return {
    scenes: Array.from({ length: n }, (_, i) => ({
      fromSentence: i,
      toSentence: i,
      frameType: frames[i % frames.length],
      background: bgs[i % bgs.length],
      onScreenText: i === 0 ? "MEET IT" : "",
      description: `The exact product from the reference photo, large and centered, shot ${i + 1}${direction ? ` in a ${direction} setting` : ""}.`,
    })),
  };
}

/** Shots used in this product's earlier ads (newest first), so new ones can avoid them. */
function earlierShots(productId: string | null, projectId: string) {
  if (!productId) return [];
  return previousVideos(productId, projectId)
    .flatMap((v) => scenesOf(v.id).map((s) => `[${s.frameType} / ${s.background}] ${s.description}`))
    .slice(0, 30);
}

export function startPlanScenesJob(projectId: string) {
  return startJob(projectId, "scenes", async (ctx) => {
    const p = getProject(projectId);
    const channel = getChannel(p.channelId);
    const sentences = sentencesOf(projectId);
    if (!sentences.length) throw new Error("Approve the script first");
    ctx.progress(0.1, `Planning scenes for ${sentences.length} sentences`);

    const numbered = sentences
      .map((s) => `${s.idx}${s.start != null ? ` [${s.start.toFixed(1)}s]` : ""}: ${s.text}`)
      .join("\n");
    const ad = isAdChannel(channel.profile);
    if (ad && !p.product) throw new Error("This ad has no product brief");
    const plan = env.dryRun
      ? ad
        ? dryAdPlan(sentences.length, p.variantHint)
        : dryPlan(sentences.length)
      : ad
        ? // Ad batches plan many videos at once: share the Claude rate limit.
          await claudeLimit(() =>
            claudeJSON(ScenePlanSchema, {
              system: adBrief(channel.profile),
              user: adScenesPrompt(channel.profile, p.product!, numbered, sentences.length, { direction: p.variantHint, avoid: earlierShots(p.productId, projectId) }),
              effort: "medium",
              maxTokens: 16000,
              kind: "scenes",
              projectId,
            }),
          )
        : await claudeJSON(ScenePlanSchema, {
            system: channelBrief(channel.profile),
            user: scenesPrompt(channel.profile, numbered, sentences.length),
            effort: "medium",
            maxTokens: 64000,
            kind: "scenes",
            projectId,
          });

    const valid = new Set(channel.profile.visual.backgrounds.map((b) => b.key));
    const frames = new Set(channel.profile.visual.frameTypes.map((f) => f.key));
    const fallbackFrame = ad ? (channel.profile.visual.frameTypes.find((f) => !f.textOnly)?.key ?? "product_hero") : "character_scene";
    const scenes = normalizeSceneRanges(plan.scenes, sentences.length);
    db.transaction((tx) => {
      tx.delete(schema.scenes).where(eq(schema.scenes.projectId, projectId)).run();
      tx.insert(schema.scenes)
        .values(
          scenes.map((s, idx) => ({
            id: nanoid(10),
            projectId,
            idx,
            fromSentence: s.fromSentence,
            toSentence: s.toSentence,
            frameType: frames.has(s.frameType) ? s.frameType : fallbackFrame,
            background: valid.has(s.background) ? s.background : "neutral",
            onScreenText: s.onScreenText?.trim() || null,
            description: s.description,
          })),
        )
        .run();
    });
    const fresh = getProject(projectId);
    const stale = { ...fresh.stale };
    delete stale.scenes;
    updateProject(projectId, { stale });
    markChanged(projectId, "scenes");
  });
}

export function scenePrompt(projectId: string, scene: { description: string; background: string; frameType: string }) {
  const p = getProject(projectId);
  const profile = getChannel(p.channelId).profile;
  return buildImagePrompt(profile, scene, isAdChannel(profile) ? "portrait" : "landscape");
}

export function updateScene(
  sceneId: string,
  values: Partial<Pick<typeof schema.scenes.$inferInsert, "description" | "background" | "frameType" | "onScreenText" | "nudgeMs" | "approved">>,
) {
  const s = db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId)).get();
  if (!s) throw new Error("Scene not found");
  db.update(schema.scenes).set(values).where(eq(schema.scenes.id, sceneId)).run();
  const visualChange = ["description", "background", "frameType"].some((k) => k in values);
  if (visualChange) {
    db.update(schema.scenes).set({ approved: false }).where(eq(schema.scenes.id, sceneId)).run();
    markChanged(s.projectId, "scenes");
  } else if ("nudgeMs" in values || "onScreenText" in values) {
    markStale(s.projectId, "render");
  }
}

/** Split a scene so that `atSentence` starts a new scene (copying its visuals). */
export function splitScene(sceneId: string, atSentence: number) {
  const s = db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId)).get();
  if (!s || atSentence <= s.fromSentence || atSentence > s.toSentence) throw new Error("Invalid split point");
  db.transaction((tx) => {
    tx.update(schema.scenes)
      .set({ idx: sql`${schema.scenes.idx} + 1` })
      .where(and(eq(schema.scenes.projectId, s.projectId), gt(schema.scenes.idx, s.idx)))
      .run();
    tx.update(schema.scenes).set({ toSentence: atSentence - 1 }).where(eq(schema.scenes.id, s.id)).run();
    tx.insert(schema.scenes)
      .values({
        ...s,
        id: nanoid(10),
        idx: s.idx + 1,
        fromSentence: atSentence,
        nudgeMs: 0,
        imagePath: null,
        imageStatus: "none",
        imageQuality: null,
        approved: false,
      })
      .run();
  });
  markChanged(s.projectId, "scenes");
}

/** Merge a scene into the previous one (the previous scene's visuals win). */
export function mergeWithPrevious(sceneId: string) {
  const s = db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId)).get();
  if (!s || s.idx === 0) throw new Error("Nothing to merge into");
  const prev = scenesOf(s.projectId).find((x) => x.idx === s.idx - 1)!;
  db.transaction((tx) => {
    tx.update(schema.scenes).set({ toSentence: s.toSentence }).where(eq(schema.scenes.id, prev.id)).run();
    tx.delete(schema.scenes).where(eq(schema.scenes.id, s.id)).run();
    tx.update(schema.scenes)
      .set({ idx: sql`${schema.scenes.idx} - 1` })
      .where(and(eq(schema.scenes.projectId, s.projectId), gt(schema.scenes.idx, s.idx)))
      .run();
  });
  markChanged(s.projectId, "scenes");
}

export function exportPrompts(projectId: string) {
  const sentences = sentencesOf(projectId);
  return scenesOf(projectId)
    .map((s) => {
      const t = sentences[s.fromSentence]?.start;
      const stamp = t != null ? `[${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}] ` : "";
      const text = s.onScreenText ? ` On-screen text: "${s.onScreenText}".` : "";
      return `${stamp}${scenePrompt(projectId, s)}${text}`;
    })
    .join("\n\n");
}
