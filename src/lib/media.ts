import "server-only";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DATA_DIR } from "@/lib/paths";

/** Absolute path for a stored relative media path (relative to data/). */
export function absPath(rel: string) {
  const p = path.resolve(DATA_DIR, rel);
  if (!p.startsWith(DATA_DIR + path.sep)) throw new Error("Invalid media path");
  return p;
}

export function projectRel(projectId: string, ...parts: string[]) {
  return path.posix.join("projects", projectId, ...parts);
}

export function writeMedia(rel: string, data: Buffer) {
  const p = absPath(rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
  return rel;
}

/** URL the browser (and the Remotion renderer) can load a media file from. */
export function mediaUrl(rel: string | null | undefined, version?: string | number) {
  if (!rel) return null;
  return `/api/media/${rel}${version != null ? `?v=${encodeURIComponent(String(version))}` : ""}`;
}

/** Downscaled JPEG of an image, for the in-browser preview (the MP4 render keeps the full PNG). */
export function previewImageUrl(rel: string | null | undefined, width = 960) {
  if (!rel) return null;
  return `/api/media/${rel}?w=${width}`;
}

/** AAC copy of a WAV, for the in-browser preview (the MP4 render keeps the lossless WAV). */
export function previewAudioUrl(rel: string | null | undefined, version?: string | number) {
  const u = mediaUrl(rel, version);
  return u && `${u}${u.includes("?") ? "&" : "?"}fmt=m4a`;
}

export const PREVIEW_WIDTHS = [480, 960, 1280];

/**
 * Cached derivative of a media file under data/.cache/preview, keyed by the source's mtime so an
 * overwritten source gets a fresh copy. Older copies of the same source are pruned. Returns the absolute path.
 */
async function cachedDerivative(file: string, suffix: string, make: (tmp: string) => Promise<unknown>) {
  const mtime = Math.round(fs.statSync(file).mtimeMs);
  const base = `${path.basename(file)}.${suffix}.`;
  const dir = path.join(DATA_DIR, ".cache", "preview", path.dirname(path.relative(DATA_DIR, file)));
  const out = path.join(dir, `${base}${mtime}`);
  if (fs.existsSync(out)) return out;
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${out}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await make(tmp);
    fs.renameSync(tmp, out);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(base) && f !== path.basename(out) && !f.endsWith(".tmp")) fs.rmSync(path.join(dir, f), { force: true });
  }
  return out;
}

/** Downscaled JPEG of a stored image. Scene PNGs are ~3 MB; decoding them at every cut stalls the Player. */
export function ensurePreviewImage(file: string, width: number) {
  return cachedDerivative(file, `w${width}`, (tmp) =>
    sharp(file).resize({ width, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(tmp),
  );
}

/** ~1 MB AAC copy of a voice WAV (often 25–30 MB), transcoded with Remotion's bundled ffmpeg. */
export function ensurePreviewAudio(file: string) {
  return cachedDerivative(file, "aac", async (tmp) => {
    const { RenderInternals } = await import("@remotion/renderer");
    await RenderInternals.callFf({
      bin: "ffmpeg",
      args: ["-y", "-v", "error", "-i", file, "-vn", "-c:a", "aac", "-b:a", "96k", "-f", "mp4", tmp],
      indent: false,
      logLevel: "error",
      binariesDirectory: null,
      cancelSignal: undefined,
    });
  });
}

/** Builds the preview copies right after a file is written, so the first preview load is instant. Never throws. */
export function warmPreview(rel: string, kind: "image" | "audio", widths = [480, 960]) {
  const file = absPath(rel);
  const jobs = kind === "image" ? widths.map((w) => ensurePreviewImage(file, w)) : [ensurePreviewAudio(file)];
  Promise.all(jobs).catch((e) => console.warn(`Preview warm-up failed for ${rel}:`, e));
}
