import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { apiImageSize, toFrame } from "./provider";
import sharp from "sharp";

describe("image sizes", () => {
  it("asks gpt-image-2 for native 16:9 / 9:16 and older models for 3:2", () => {
    expect(apiImageSize("gpt-image-2", "landscape")).toBe("1536x864");
    expect(apiImageSize("gpt-image-2", "portrait")).toBe("864x1536");
    expect(apiImageSize("gpt-image-1", "landscape")).toBe("1536x1024");
  });

  it("a native 16:9 image is scaled, not cropped, to 1920x1080", async () => {
    // Red top and bottom rows: a crop would remove them.
    const w = 1536, h = 864;
    const raw = Buffer.alloc(w * h * 3, 255);
    for (const y of [0, 1, h - 2, h - 1]) for (let x = 0; x < w; x++) raw[(y * w + x) * 3 + 1] = raw[(y * w + x) * 3 + 2] = 0;
    const png = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
    const out = await toFrame(png, "landscape");
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([1920, 1080]);
    const px = (y: number) => [data[(y * info.width + 960) * info.channels], data[(y * info.width + 960) * info.channels + 1]];
    expect(px(0)).toEqual([255, 0]); // top edge still red
    expect(px(1079)[1]).toBeLessThan(80); // bottom edge still red(ish after scaling)
  });
});
