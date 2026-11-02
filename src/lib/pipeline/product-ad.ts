import "server-only";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { claudeJSON } from "@/lib/ai/claude";
import { adBrief, adScriptPrompt } from "@/lib/ai/prompts/ad";
import { isAdChannel } from "@/lib/channel";
import { pickVariant } from "@/lib/ai/prompts/ad-variety";
import { absPath } from "@/lib/media";
import { slugify } from "@/lib/sync";
import { AdScriptSchema, type ProductBrief, type VoiceMode } from "@/lib/types";
import { applySilentTiming, getChannel, getProject, markChanged, markStale, scenesOf, sentencesOf, updateProject } from "./common";
import { addProductPhoto, cleanBrief, getProduct, previousVideos, removeProductPhoto, toBrief, updateProduct, type BriefFields } from "./products";
import { snapshotCurrent } from "./history";
import { claudeLimit } from "@/lib/jobs/queue";
import { saveScript } from "./script";

/** A new video of a saved product. The brief is snapshotted so later product edits don't change it. */
export function createAdProject(input: { productId: string; voiceMode?: VoiceMode; channelId?: string }) {
  const product = getProduct(input.productId);
  const channel = getChannel(input.channelId ?? product.channelId);
  if (!isAdChannel(channel.profile)) throw new Error("Switch to a product-ad channel first");
  if (product.channelId !== channel.id) throw new Error("That product belongs to another channel");
  const id = nanoid(10);
  const used = previousVideos(product.id).map((v) => v.variantHint);
  db.insert(schema.projects)
    .values({
      id,
      channelId: channel.id,
      title: product.name,
      slug: slugify(product.name),
      // Ads are short: tighter gaps between sentences than a narrated video.
      pauseMs: 150,
      product: toBrief(product),
      productId: product.id,
      voiceMode: input.voiceMode === "none" ? "none" : "voice",
      variantHint: pickVariant(used),
    })
    .run();
  return id;
}

export function productOf(projectId: string): ProductBrief {
  const p = getProject(projectId);
  if (!p.product) throw new Error("This video has no product brief");
  return p.product;
}

/** Edit the brief from a video: updates this video and the saved product (so new videos get it too). */
export function updateBrief(projectId: string, patch: Partial<BriefFields>) {
  const p = getProject(projectId);
  const cur = productOf(projectId);
  const next = { ...cleanBrief(patch, cur), imagePaths: cur.imagePaths };
  updateProject(projectId, { product: next, title: next.name });
  if (p.productId) updateProduct(p.productId, next);
  return next;
}

/** Photo changes go to the saved product; this video's snapshot follows. */
export async function addProductImage(projectId: string, data: Buffer) {
  const p = getProject(projectId);
  if (!p.productId) throw new Error("This video isn't linked to a saved product");
  await addProductPhoto(p.productId, data);
  updateProject(projectId, { product: { ...productOf(projectId), imagePaths: getProduct(p.productId).imagePaths } });
  markChanged(projectId, "images");
}

export function removeProductImage(projectId: string, rel: string) {
  const p = getProject(projectId);
  if (!p.productId) throw new Error("This video isn't linked to a saved product");
  const cur = productOf(projectId);
  if (cur.imagePaths.length <= 1) throw new Error("Keep at least one product photo");
  // Drop it from this video first so the product can delete the file if nothing else uses it.
  updateProject(projectId, { product: { ...cur, imagePaths: cur.imagePaths.filter((x) => x !== rel) } });
  if (getProduct(p.productId).imagePaths.includes(rel)) removeProductPhoto(p.productId, rel);
  markChanged(projectId, "images");
}

/** Pick another visual direction this product hasn't used; scenes need re-planning. */
export function shuffleVariant(projectId: string) {
  const p = getProject(projectId);
  const used = [p.variantHint, ...(p.productId ? previousVideos(p.productId, projectId).map((v) => v.variantHint) : [])];
  const variantHint = pickVariant(used);
  updateProject(projectId, { variantHint });
  if (scenesOf(projectId).length) updateProject(projectId, { stale: { ...getProject(projectId).stale, scenes: true } });
  return variantHint;
}

/**
 * Voiceover on or off. Silent ads time each line by reading pace instead of the voice;
 * switching either way means the render (and for "voice", the voiceover) has to be redone.
 */
export function setVoiceMode(projectId: string, mode: VoiceMode) {
  const p = getProject(projectId);
  if (p.voiceMode === mode) return;
  updateProject(projectId, { voiceMode: mode, audioPath: null, audioDuration: null });
  if (mode === "none" && sentencesOf(projectId).length) applySilentTiming(projectId);
  if (mode === "voice") {
    for (const s of sentencesOf(projectId)) db.update(schema.sentences).set({ start: null, end: null }).where(eq(schema.sentences.id, s.id)).run();
    markChanged(projectId, "voice");
  }
  markStale(projectId, "render");
}

/** Absolute paths of the product photos, used as image-model references. */
export function productRefs(projectId: string) {
  return (getProject(projectId).product?.imagePaths ?? []).filter((rel) => fs.existsSync(absPath(rel))).map((rel) => absPath(rel));
}

const DRY_HOOKS = ["Tired of settling for less?", "You need to see this.", "Stop scrolling for a second.", "This changed my mornings.", "Okay, real talk."];

function dryScript(b: ProductBrief, n: number) {
  return [
    DRY_HOOKS[n % DRY_HOOKS.length],
    `Meet ${b.name}.`,
    ...b.sellingPoints.slice(0, 2).map((s) => `${s.replace(/\.$/, "")}.`),
    `${b.cta.replace(/[.!]$/, "")}!`,
  ];
}

/** Claude writes the voiceover from the brief. One paragraph, one sentence per scene later. */
export async function generateAdScript(projectId: string, feedback?: string) {
  const p = getProject(projectId);
  const brief = productOf(projectId);
  const profile = getChannel(p.channelId).profile;
  snapshotCurrent(projectId, "script");
  // Earlier videos of this product: the new one should open differently.
  const previousHooks = (p.productId ? previousVideos(p.productId, projectId) : [])
    .map((v) => v.script?.split(/(?<=[.!?])\s+/)[0]?.trim())
    .filter((h): h is string => Boolean(h));
  const sentences = env.dryRun
    ? dryScript(brief, previousHooks.length)
    : (
        await claudeLimit(() => claudeJSON(AdScriptSchema, {
          system: adBrief(profile),
          user: adScriptPrompt(brief, {
            feedback: feedback?.trim() || undefined,
            previous: feedback?.trim() ? (p.script ?? undefined) : undefined,
            previousHooks,
            silent: p.voiceMode === "none",
          }),
          effort: "medium",
          maxTokens: 4000,
          kind: "script",
          projectId,
        }))
      ).sentences;
  const script = sentences.map((s) => s.trim()).filter(Boolean).join(" ");
  if (!script) throw new Error("Claude returned an empty script, try again");
  saveScript(projectId, script, "ai");
  return script;
}
