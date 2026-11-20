import { describe, expect, it } from "vitest";
import { ANCIENT_HUMANS_PROFILE } from "@/lib/channel-seed";
import { normalizeProfile } from "@/lib/channel-normalize";
import { showsMainCharacter, thumbnailPrompt } from "./thumbnail";

const p = normalizeProfile(ANCIENT_HUMANS_PROFILE);
const title = "Why the UFO Came Back";
const ufo = 'A glowing disc hovers over a dark pine forest, fog below it. Mood: mystery. Text "IT CAME BACK" top left.';

describe("thumbnail prompt", () => {
  it("anchors on the title, makes its subject the hero and leaves the channel character out unless asked", () => {
    const prompt = thumbnailPrompt(p, title, ufo);
    expect(prompt).toContain(`titled "${title}"`);
    expect(prompt).toContain("glowing disc");
    expect(prompt).not.toContain(p.visual.mainCharacter);
    expect(showsMainCharacter(ufo)).toBe(false);
  });

  it("describes the main character only when the concept includes them", () => {
    const concept = `${ufo} The main character, small in the corner, looks up in shock.`;
    expect(showsMainCharacter(concept)).toBe(true);
    expect(thumbnailPrompt(p, title, concept)).toContain(p.visual.mainCharacter);
  });

  it("allows the thumbnail text but keeps the channel style", () => {
    const prompt = thumbnailPrompt(p, title, ufo);
    expect(prompt.startsWith(p.visual.styleAnchor)).toBe(true);
    expect(prompt).not.toMatch(/no text or letters/i);
    expect(prompt).toContain("16:9");
  });
});

describe("drama thumbnail prompt", () => {
  const drama = normalizeProfile({ ...ANCIENT_HUMANS_PROFILE, genre: "drama", language: "vi" });
  const concept = 'The father-in-law points at the camera; the daughter-in-law cries. Tag "U80". Headline "CON DÂU LỠ" / "THƯƠNG EM CHỒNG!". Banner "CHUYỆN KHÓ TIN".';

  it("uses the stacked drama layout and a photo-real look instead of the channel's art style", () => {
    const prompt = thumbnailPrompt(drama, "Con dâu lỡ thương em chồng", concept);
    expect(prompt).toContain("CON DÂU LỠ");
    expect(prompt).toMatch(/red rounded badge/);
    expect(prompt).toMatch(/line 1 bright yellow and line 2 bright red/);
    expect(prompt).toMatch(/slanted bright blue ribbon/);
    expect(prompt).not.toContain(drama.visual.styleAnchor);
  });

  it("asks drama metadata for tag, two-line headline and banner", async () => {
    const { metadataPrompt } = await import("./index");
    const text = metadataPrompt(drama, "Con dâu lỡ thương em chồng", "script");
    expect(text).toContain('Tag "…". Headline "…" / "…". Banner "…".');
    expect(metadataPrompt(p, title, "script")).not.toContain("Banner");
  });
});
