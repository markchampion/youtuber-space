import { describe, expect, it } from "vitest";
import { ANCIENT_HUMANS_PROFILE as p } from "@/lib/channel-seed";
import { PRODUCT_AD_PROFILE } from "@/lib/channel-seed-ad";
import { normalizeProfile } from "@/lib/channel-normalize";
import { PRODUCT_FIDELITY, buildImagePrompt, needsImage } from "./image";

describe("image prompt assembly", () => {
  it("always wraps the scene in the channel's style anchor and lock", () => {
    const prompt = buildImagePrompt(p, {
      description: "A worried stick figure with spiky orange hair pushes a gray boulder.",
      background: "prehistoric",
      frameType: "character_scene",
    });
    expect(prompt.startsWith(p.visual.styleAnchor)).toBe(true);
    expect(prompt.endsWith(p.visual.styleLock)).toBe(true);
    expect(prompt).toContain("flat orange sky");
  });

  it("draws concept-text frames in code instead of generating an image", () => {
    expect(needsImage(p, { frameType: "concept_text", onScreenText: "300,000 YEARS" })).toBe(false);
    expect(needsImage(p, { frameType: "concept_text", onScreenText: "" })).toBe(true);
    expect(needsImage(p, { frameType: "character_scene", onScreenText: "SURVIVAL" })).toBe(true);
  });

  it("product ads lead with product fidelity and ask for a 9:16 frame", () => {
    const ad = normalizeProfile(PRODUCT_AD_PROFILE);
    const prompt = buildImagePrompt(ad, { description: "The exact product from the reference photo on a marble counter.", background: "studio", frameType: "product_hero" }, "portrait");
    expect(prompt.startsWith(PRODUCT_FIDELITY)).toBe(true);
    expect(prompt).toContain("9:16");
    expect(prompt).not.toContain("16:9 widescreen");
    // Long-form prompts are unchanged.
    expect(buildImagePrompt(p, { description: "x", background: "neutral", frameType: "character_scene" })).not.toContain(PRODUCT_FIDELITY);
  });
});
