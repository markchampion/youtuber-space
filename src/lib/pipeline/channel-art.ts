import "server-only";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import { isAdChannel } from "@/lib/channel";
import { avatarPrompt, bannerPrompt, type ChannelArtKind } from "@/lib/ai/prompts/channel-art";
import { imageProvider } from "@/lib/image/provider";
import { imageLimit } from "@/lib/jobs/queue";
import { absPath, mediaUrl, writeMedia } from "@/lib/media";
import { getChannel } from "./common";
import { setLogo } from "./channels";

/** Upload sizes: YouTube profile picture and banner (both also work for TikTok / Facebook). */
export const ART_SIZE: Record<ChannelArtKind, { w: number; h: number }> = {
  avatar: { w: 800, h: 800 },
  banner: { w: 2560, h: 1440 },
};

const column = (kind: ChannelArtKind) => (kind === "avatar" ? "avatarPath" : "bannerPath");

/** Generated options of one kind for a channel, newest first. */
export function channelArtCandidates(channelId: string, kind: ChannelArtKind) {
  const dir = absPath(path.posix.join("channels", channelId));
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${kind}_`) && f.endsWith(".png"))
    .sort()
    .reverse()
    .map((f) => path.posix.join("channels", channelId, f));
}

/** Current pick and options of both kinds, with URLs, for the Channel page. */
export function channelArt(channelId: string) {
  const c = getChannel(channelId);
  const of = (kind: ChannelArtKind) => {
    const current = c[column(kind)];
    return { current, currentUrl: mediaUrl(current), candidates: channelArtCandidates(channelId, kind).map((rel) => ({ rel, url: mediaUrl(rel) })) };
  };
  return { avatar: of("avatar"), banner: of("banner") };
}

/** Generate `count` options from the channel profile. The first one is picked if nothing is picked yet. */
export async function generateChannelArt(channelId: string, kind: ChannelArtKind, opts: { count?: number; withName?: boolean } = {}) {
  const channel = getChannel(channelId);
  const withName = opts.withName !== false;
  const prompt = kind === "avatar" ? avatarPrompt(channel.profile, { withName }) : bannerPrompt(channel.profile, { withName });
  // Long-form channels: keep the main character on model, like scene images do.
  const ref = !isAdChannel(channel.profile) && channel.characterRefPath && fs.existsSync(absPath(channel.characterRefPath)) ? [absPath(channel.characterRefPath)] : [];
  const size = ART_SIZE[kind];
  const provider = imageProvider();
  const created = await Promise.all(
    Array.from({ length: Math.max(1, Math.min(4, opts.count ?? 2)) }, () =>
      imageLimit(async () => {
        const raw = await provider.generate({ prompt, quality: "medium", referencePaths: ref, projectId: null, orientation: kind === "avatar" ? "square" : "landscape" });
        const png = await sharp(raw).resize(size.w, size.h, { fit: "cover", kernel: "lanczos3" }).png().toBuffer();
        return writeMedia(path.posix.join("channels", channelId, `${kind}_${Date.now()}_${nanoid(4)}.png`), png);
      }),
    ),
  );
  if (!channel[column(kind)]) setChannelArt(channelId, kind, created[0]);
  return created;
}

export function setChannelArt(channelId: string, kind: ChannelArtKind, rel: string | null) {
  if (rel && !channelArtCandidates(channelId, kind).includes(rel)) throw new Error("Unknown image");
  db.update(schema.channels)
    .set({ [column(kind)]: rel })
    .where(eq(schema.channels.id, channelId))
    .run();
}

/** Delete an option. The one in use is unpicked first. */
export function deleteChannelArt(channelId: string, rel: string) {
  const kind: ChannelArtKind | null = channelArtCandidates(channelId, "avatar").includes(rel)
    ? "avatar"
    : channelArtCandidates(channelId, "banner").includes(rel)
      ? "banner"
      : null;
  if (!kind) throw new Error("Unknown image");
  if (getChannel(channelId)[column(kind)] === rel) setChannelArt(channelId, kind, null);
  fs.rmSync(absPath(rel), { force: true });
}

/** Use the picked avatar as the video watermark logo (Branding). */
export async function avatarAsLogo(channelId: string) {
  const rel = getChannel(channelId).avatarPath;
  if (!rel) throw new Error("Pick an avatar first");
  return setLogo(channelId, fs.readFileSync(absPath(rel)));
}
