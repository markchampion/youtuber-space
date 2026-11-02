import { describe, expect, it } from "vitest";
import { ANCIENT_HUMANS_PROFILE } from "@/lib/channel-seed";
import { PRODUCT_AD_PROFILE } from "@/lib/channel-seed-ad";
import { normalizeProfile } from "@/lib/channel-normalize";
import { artLock, avatarPrompt, avatarText, bannerPrompt } from "./channel-art";

const longform = normalizeProfile(ANCIENT_HUMANS_PROFILE);
const ad = normalizeProfile({ ...PRODUCT_AD_PROFILE, name: "Lumi Home" });

describe("channel art prompts", () => {
  it("drops the no-text rule and the 16:9 shape from the style lock", () => {
    for (const p of [longform, ad]) {
      const lock = artLock(p, "1:1 square");
      expect(lock).not.toMatch(/\btext\b|letters/i);
      expect(lock).not.toContain("16:9");
      expect(lock).toContain("1:1 square");
    }
  });

  it("writes the name only when asked", () => {
    expect(avatarPrompt(ad, { withName: true })).toContain('"Lumi Home"');
    expect(avatarPrompt(ad, { withName: false })).not.toContain("Lumi Home");
    expect(bannerPrompt(ad, { withName: true })).toContain('"Lumi Home"');
    expect(bannerPrompt(ad, { withName: false })).toContain("No text or letters at all.");
  });

  it("long-form art shows the main character; ad art a brand mark", () => {
    expect(avatarPrompt(longform, { withName: false })).toContain(longform.visual.mainCharacter);
    expect(avatarPrompt(ad, { withName: false })).toContain("brand mark");
  });

  it("shortens long names to initials for the avatar", () => {
    expect(avatarText("Lumi Home")).toBe("Lumi Home");
    expect(avatarText("Wait, Why Does That Happen?")).toBe("WWD");
  });
});
