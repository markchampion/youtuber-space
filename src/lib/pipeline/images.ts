import "server-only";
import fs from "node:fs";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import { characterSheetPrompt, needsImage } from "@/lib/ai/prompts/image";
import { imageProvider, to1080p, toFrame, type ImageQuality } from "@/lib/image/provider";
import { absPath, projectRel, warmPreview, writeMedia } from "@/lib/media";
import { imageLimit, startJob } from "@/lib/jobs/queue";
import { getChannel, getProject, markChanged, scenesOf } from "./common";
import { scenePrompt } from "./scenes";
import { productRefs } from "./product-ad";
import { isAdChannel } from "@/lib/channel";

// ---------- Character reference ----------

export function characterCandidates(channelId: string) {
  const dir = absPath(path.posix.join("channels", channelId));
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("character_") && f.endsWith(".png"))
    .sort()
    .reverse()
    .map((f) => path.posix.join("channels", channelId, f));
}

export async function generateCharacterCandidates(channelId: string, count = 2) {
  const channel = getChannel(channelId);
  const prompt = characterSheetPrompt(channel.profile);
  const provider = imageProvider();
  const out = await Promise.all(
    Array.from({ length: count }, () =>
      imageLimit(async () => {
        const png = await provider.generate({ prompt, quality: "medium", projectId: null });
        return writeMedia(path.posix.join("channels", channelId, `character_${Date.now()}_${nanoid(4)}.png`), png);
      }),
    ),
  );
  return out;
}

export function setCharacterRef(channelId: string, rel: string | null) {
  if (rel) absPath(rel); // validates the path
  db.update(schema.channels).set({ characterRefPath: rel }).where(eq(schema.channels.id, channelId)).run();
}

// ---------- Scene images ----------

export function startImagesJob(projectId: string, opts: { sceneIds?: string[]; quality: ImageQuality; onlyMissing?: boolean }) {
  // Mark targets as queued right away so the grid reflects it immediately.
  const p = getProject(projectId);
  const channel = getChannel(p.channelId);
  let targets = scenesOf(projectId);
  if (opts.sceneIds?.length) targets = targets.filter((s) => opts.sceneIds!.includes(s.id));
  else if (opts.onlyMissing) targets = targets.filter((s) => !s.imagePath && !s.approved);
  targets = targets.filter((s) => needsImage(channel.profile, s));
  if (!targets.length) return null;
  db.update(schema.scenes)
    .set({ imageStatus: "queued", imageError: null })
    .where(inArray(schema.scenes.id, targets.map((t) => t.id)))
    .run();

  const type = opts.sceneIds?.length === 1 ? `images:${opts.sceneIds[0]}` : "images";
  return startJob(projectId, type, async (ctx) => {
    // Ads edit the uploaded product photos; long-form videos keep the channel's character on model.
    const ad = isAdChannel(channel.profile);
    const ref = ad ? productRefs(projectId) : channel.characterRefPath ? [absPath(channel.characterRefPath)] : [];
    if (ad && !ref.length) throw new Error("Upload a product photo first");
    const provider = imageProvider();
    let done = 0;
    let failed = 0;
    await Promise.all(
      targets.map((scene) =>
        imageLimit(async () => {
          db.update(schema.scenes).set({ imageStatus: "generating" }).where(eq(schema.scenes.id, scene.id)).run();
          try {
            const png = await withRetry(() =>
              provider.generate({
                prompt: scenePrompt(projectId, scene),
                quality: opts.quality,
                referencePaths: ref,
                projectId,
                orientation: ad ? "portrait" : "landscape",
              }),
            );
            const rel = writeMedia(projectRel(projectId, "images", `${scene.id}_${Date.now()}.png`), png);
            warmPreview(rel, "image");
            const old = scene.imagePath;
            db.update(schema.scenes)
              .set({ imagePath: rel, imageQuality: opts.quality, imageStatus: "done", approved: false })
              .where(eq(schema.scenes.id, scene.id))
              .run();
            if (old) fs.rmSync(absPath(old), { force: true });
          } catch (e) {
            failed++;
            db.update(schema.scenes)
              .set({ imageStatus: "error", imageError: e instanceof Error ? e.message : String(e) })
              .where(eq(schema.scenes.id, scene.id))
              .run();
          }
          done++;
          ctx.progress(done / targets.length, `${done}/${targets.length} images${failed ? ` (${failed} failed)` : ""}`);
        }),
      ),
    );
    markChanged(projectId, "images");
    if (failed === targets.length) throw new Error("All image generations failed — see the scene cards for details");
  });
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const status = (e as { status?: number }).status;
      if (status && status < 500 && status !== 429) break; // not retryable
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
    }
  }
  throw last;
}

export async function uploadSceneImage(sceneId: string, data: Buffer) {
  const s = db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId)).get();
  if (!s) throw new Error("Scene not found");
  const profile = getChannel(getProject(s.projectId).channelId).profile;
  const png = isAdChannel(profile) ? await toFrame(data, "portrait") : await to1080p(data);
  const rel = writeMedia(projectRel(s.projectId, "images", `${s.id}_upload_${Date.now()}.png`), png);
  warmPreview(rel, "image");
  if (s.imagePath) fs.rmSync(absPath(s.imagePath), { force: true });
  db.update(schema.scenes)
    .set({ imagePath: rel, imageStatus: "done", imageQuality: "upload", approved: true, imageError: null })
    .where(eq(schema.scenes.id, sceneId))
    .run();
  markChanged(s.projectId, "images");
}

export function approveAllImages(projectId: string) {
  const channel = getChannel(getProject(projectId).channelId);
  for (const s of scenesOf(projectId)) {
    if (s.imagePath || !needsImage(channel.profile, s)) {
      db.update(schema.scenes).set({ approved: true }).where(eq(schema.scenes.id, s.id)).run();
    }
  }
}

