import "server-only";
import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { env } from "@/lib/env";
import { recordCost } from "@/lib/costs";
import { CodexImageProvider } from "./codex";

export type ImageQuality = "low" | "medium" | "high";
export type Orientation = "landscape" | "portrait" | "square";

export interface ImageProvider {
  generate(opts: {
    prompt: string;
    quality: ImageQuality;
    referencePaths?: string[];
    projectId: string | null;
    orientation?: Orientation;
  }): Promise<Buffer>; // PNG, already 1920x1080 (landscape) or 1080x1920 (portrait)
}

const FRAME: Record<Orientation, { w: number; h: number; native: string; legacy: "1536x1024" | "1024x1536" | "1024x1024" }> = {
  // gpt-image-2 accepts any WxH (multiples of 16), so ask for true 16:9 / 9:16 and avoid cropping.
  landscape: { w: 1920, h: 1080, native: "1536x864", legacy: "1536x1024" },
  portrait: { w: 1080, h: 1920, native: "864x1536", legacy: "1024x1536" },
  // Channel avatars.
  square: { w: 1024, h: 1024, native: "1024x1024", legacy: "1024x1024" },
};

/** Older models only take fixed 3:2 sizes, which then lose ~8% top and bottom to the 16:9 crop. */
export function apiImageSize(model: string, orientation: Orientation) {
  return model.startsWith("gpt-image-2") ? FRAME[orientation].native : FRAME[orientation].legacy;
}

/** Center-crop (cover) to the target frame. */
export async function toFrame(input: Buffer, orientation: Orientation = "landscape"): Promise<Buffer> {
  const f = FRAME[orientation];
  return sharp(input).resize(f.w, f.h, { fit: "cover", position: "centre" }).png().toBuffer();
}

// Approximate $ per 1536x1024 image, for the cost meter only.
const PRICE: Record<ImageQuality, number> = { low: 0.02, medium: 0.06, high: 0.25 };

/** Center-crop (cover) to 16:9 and resize to 1920x1080. */
export async function to1080p(input: Buffer): Promise<Buffer> {
  return toFrame(input, "landscape");
}

let client: { key: string; api: OpenAI } | null = null;
export function openaiClient() {
  const key = env.openaiKey;
  if (!key) throw new Error("OpenAI API key is not set. Add it in Settings (or turn on dry run).");
  if (client?.key !== key) client = { key, api: new OpenAI({ apiKey: key }) };
  return client.api;
}

class OpenAIImageProvider implements ImageProvider {
  private get api() {
    return openaiClient();
  }

  async generate({ prompt, quality, referencePaths = [], projectId, orientation = "landscape" }: Parameters<ImageProvider["generate"]>[0]) {
    const refs = referencePaths.filter((p) => fs.existsSync(p));
    const call = async (size: string) => {
      const common = { model: env.imageModel, prompt, size, quality, n: 1 };
      return refs.length
        ? this.api.images.edit({
            ...common,
            image: await Promise.all(refs.map((p) => toFile(fs.createReadStream(p), "reference.png", { type: "image/png" }))),
          })
        : this.api.images.generate(common);
    };
    const size = apiImageSize(env.imageModel, orientation);
    let res;
    try {
      res = await call(size);
    } catch (e) {
      // If this model rejects the custom size, fall back to the standard one (and crop).
      if (size === FRAME[orientation].legacy || !(e instanceof OpenAI.BadRequestError)) throw e;
      res = await call(FRAME[orientation].legacy);
    }
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image API returned no image data");
    recordCost(projectId, "openai", `image_${quality}`, PRICE[quality]);
    return toFrame(Buffer.from(b64, "base64"), orientation);
  }
}

class PlaceholderProvider implements ImageProvider {
  async generate({ prompt, orientation = "landscape" }: { prompt: string; orientation?: Orientation }) {
    const hue = [...prompt].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
    const text = prompt.replace(/^.*?lines,\s*/, "").slice(0, 110).replace(/[<&>]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
      <rect width="100%" height="100%" fill="hsl(${hue},55%,86%)"/>
      <rect y="820" width="100%" height="260" fill="hsl(${hue},35%,70%)"/>
      <circle cx="960" cy="470" r="110" fill="#fff" stroke="#111" stroke-width="10"/>
      <path d="M860 380 l30 -60 l30 55 l30 -65 l30 60 l30 -55 l30 65" fill="none" stroke="#F58220" stroke-width="18"/>
      <line x1="960" y1="580" x2="960" y2="780" stroke="#111" stroke-width="10"/>
      <text x="960" y="1000" font-size="34" text-anchor="middle" font-family="sans-serif" fill="#222">${text}</text>
    </svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    if (orientation === "landscape") return png;
    if (orientation === "square") return sharp(png).resize(1024, 1024, { fit: "cover" }).png().toBuffer();
    // Portrait placeholder: the same drawing, centered on a tall canvas.
    return sharp(await sharp(png).resize(1080).toBuffer())
      .extend({ top: 656, bottom: 656, background: `hsl(${hue},55%,86%)` })
      .png()
      .toBuffer();
  }
}

export function imageProvider(): ImageProvider {
  if (env.dryRun) return new PlaceholderProvider();
  return env.imageBackend === "codex" ? new CodexImageProvider() : new OpenAIImageProvider();
}
