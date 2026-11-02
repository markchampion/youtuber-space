import fs from "node:fs";
import path from "node:path";
import { PREVIEW_WIDTHS, absPath, ensurePreviewAudio, ensurePreviewImage } from "@/lib/media";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".srt": "text/plain; charset=utf-8",
  ".json": "application/json",
};

/**
 * Pull-based file stream. Unlike Readable.toWeb, it stops cleanly when the
 * browser cancels a range request (seeking/closing a video) instead of
 * enqueueing into a closed controller and crashing the server.
 */
function fileStream(file: string, opts?: { start: number; end: number }): ReadableStream<Uint8Array> {
  const node = fs.createReadStream(file, opts);
  const chunks = node[Symbol.asyncIterator]();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (cancelled) return;
        if (done) controller.close();
        else controller.enqueue(new Uint8Array(value as Buffer));
      } catch (e) {
        if (!cancelled) controller.error(e);
      }
    },
    cancel() {
      cancelled = true;
      node.destroy();
    },
  });
}

/** Serves generated media from data/, with Range support so audio/video can seek. */
export async function GET(req: Request, ctx: RouteContext<"/api/media/[...path]">) {
  const { path: parts } = await ctx.params;
  let file: string;
  try {
    file = absPath(parts.join("/"));
  } catch {
    return new Response("Bad path", { status: 400 });
  }
  if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  let stat = fs.statSync(file);
  let type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  // Preview derivatives: smaller copies for the browser Player. The MP4 render never asks for these.
  const width = Number(url.searchParams.get("w"));
  if (PREVIEW_WIDTHS.includes(width) && type.startsWith("image/")) {
    file = await ensurePreviewImage(file, width);
    stat = fs.statSync(file);
    type = "image/jpeg";
  } else if (url.searchParams.get("fmt") === "m4a" && type === "audio/wav") {
    try {
      file = await ensurePreviewAudio(file);
      stat = fs.statSync(file);
      type = "audio/mp4";
    } catch (e) {
      // Fall back to the WAV so the preview still plays.
      console.warn("Preview audio transcode failed:", e);
    }
  }
  const size = stat.size;
  // Files can be overwritten in place (voice.wav), so revalidate, but let unchanged files come back as 304.
  const etag = `"${size.toString(36)}-${Math.round(stat.mtimeMs).toString(36)}"`;
  const headers: Record<string, string> = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-cache", ETag: etag };
  if (req.headers.get("if-none-match") === etag && !req.headers.get("range")) return new Response(null, { status: 304, headers });
  if (url.searchParams.get("download")) headers["Content-Disposition"] = `attachment; filename="${path.basename(file)}"`;

  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const body = fileStream(file, { start, end });
    return new Response(body, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const body = fileStream(file);
  return new Response(body, { headers: { ...headers, "Content-Length": String(size) } });
}
