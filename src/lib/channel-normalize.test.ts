import { describe, expect, it } from "vitest";
import { ANCIENT_HUMANS_PROFILE as seed } from "./channel-seed";
import { normalizeProfile, stripLength } from "./channel-normalize";
import { DEFAULT_BRANDING, lengthBudget, onScreenFont, watermarkFor, type ProfileV1 } from "./channel";
import type { FontKey } from "./languages";

describe("normalizeProfile", () => {
  it("enforces the pipeline invariants on a messy draft", () => {
    const messy = {
      ...seed,
      topicAngles: [
        { id: 3, name: "", template: "Why did ___?", description: "" },
        { id: 3, name: "Dup", template: "Dup", description: "" },
        { id: 0, name: "", template: "", description: "blank row" },
      ],
      scriptWords: { min: 5, max: 1 },
      visual: {
        ...seed.visual,
        styleAnchor: "Flat vector style.",
        styleLock: "no gradients",
        frameTypes: [{ key: "Wide Shot", label: "Wide", description: "x" }],
        backgrounds: [{ key: "space", label: "Space", description: "black", mood: "awe" }],
        palette: [{ name: "Blue", hex: "#2563eb" }, { name: "Bad", hex: "blue" }],
        textColor: "#ffffff",
      },
    };
    const p = normalizeProfile(messy);
    expect(p.topicAngles.map((a) => a.id)).toEqual([3, 4]);
    expect(p.topicAngles[0].name).toBe("Why did ___?");
    expect(p.visual.frameTypes.find((f) => f.key === "concept_text")?.textOnly).toBe(true);
    expect(p.visual.frameTypes.some((f) => f.key === "wide_shot" && !f.textOnly)).toBe(true);
    expect(p.visual.backgrounds.some((b) => b.key === "neutral")).toBe(true);
    expect(p.visual.styleLock).toMatch(/no text or letters.*16:9/);
    expect(p.visual.styleAnchor.endsWith(",")).toBe(true);
    expect(p.visual.palette).toEqual([{ name: "Blue", hex: "#2563EB" }]);
    expect(p.visual.textColor).toBe("#FFFFFF");
    expect(p.lengthMinutes!.max).toBeGreaterThanOrEqual(p.lengthMinutes!.min);
  });

  it("leaves the seeded profile's angles and frames intact", () => {
    const p = normalizeProfile(seed);
    expect(p.topicAngles.map((a) => a.id)).toEqual(seed.topicAngles.map((a) => a.id));
    expect(p.visual.frameTypes.length).toBe(seed.visual.frameTypes.length);
  });
});

describe("v1 → v2 migration", () => {
  const { profileVersion: _v, outlineTemplate: _t, ...base } = seed;
  void _v;
  void _t;
  const v1: ProfileV1 = {
    ...base,
    format: "7–12 minute educational explainer, doodle animation.",
    lengthMinutes: undefined,
    scriptWords: { min: 1500, max: 2400 },
    hookFormula: "Start inside a sensory moment, then reframe.",
    scriptRhythm: "Short. Short. One longer.",
    narrativeArc: "Hook → Evidence → Twist",
    visual: { ...seed.visual, artStyle: "Flat colors", objects: "Chunky crates and boulders" },
  };

  it("folds merged fields into the ones the pipeline uses, keeping the originals", () => {
    const p = normalizeProfile(v1);
    expect(p.profileVersion).toBe(2);
    expect(p.outlineTemplate!.beats[0].guidance).toContain("Hook: Start inside a sensory moment");
    expect(p.extraScriptRules).toContain("Rhythm: Short. Short. One longer.");
    expect(p.visual.conceptDevices).toContain("Recurring props: Chunky crates and boulders");
    expect(p.legacy).toEqual({
      hookFormula: v1.hookFormula,
      scriptRhythm: v1.scriptRhythm,
      narrativeArc: v1.narrativeArc,
      artStyle: "Flat colors",
      objects: "Chunky crates and boulders",
    });
    expect(p.format).toBe("Educational explainer, doodle animation.");
    expect(p.scriptWords).toBeUndefined();
    expect("hookFormula" in p || "artStyle" in p.visual || "objects" in p.visual).toBe(false);
    // Same length as before: 1500–2400 words at 170 wpm.
    expect(lengthBudget(p).maxWords).toBe(Math.round(p.lengthMinutes!.max * 170));
    expect(p.lengthMinutes).toEqual({ min: 8.75, max: 14 });
  });

  it("is idempotent", () => {
    const once = normalizeProfile(v1);
    expect(normalizeProfile(once)).toEqual(once);
  });

  it("leaves v2 profiles alone", () => {
    const p = normalizeProfile(seed);
    expect(p.legacy).toBeUndefined();
    expect(p.outlineTemplate).toEqual(normalizeProfile(p).outlineTemplate);
  });
});

describe("stripLength", () => {
  it("removes durations from the format", () => {
    expect(stripLength("7–12 minute educational explainer, hand-drawn doodle animation.")).toBe("Educational explainer, hand-drawn doodle animation.");
    expect(stripLength("5 to 8 minutes long story videos")).toBe("Story videos");
    expect(stripLength("Short explainers")).toBe("Short explainers");
    expect(stripLength("Short funny-fact explainer of 1 to 2 minutes. Cute, kawaii-style 2D cartoon animation, fast cuts (a new image every 3–5 seconds), one fact per video.")).toBe(
      "Short funny-fact explainer. Cute, kawaii-style 2D cartoon animation, fast cuts (a new image every 3–5 seconds), one fact per video.",
    );
  });
});

describe("autopilot config", () => {
  it("drops pauses after the stop step", () => {
    const p = normalizeProfile({ ...seed, autopilot: { stopAfter: "script", pauseAfter: ["outline", "scenes"], imageQuality: "low", captions: true, kenBurns: true } });
    expect(p.autopilot!.pauseAfter).toEqual(["outline"]);
  });
});

describe("on-screen font", () => {
  it("drops unknown fonts", () => {
    const p = normalizeProfile({ ...seed, visual: { ...seed.visual, font: "comic-sans" as FontKey } });
    expect(p.visual.font).toBeUndefined();
    expect(onScreenFont(p)).toBe("marker");
  });

  it("keeps a font that can show the language, else falls back to the language font", () => {
    const cinzel = normalizeProfile({ ...seed, visual: { ...seed.visual, font: "cinzel" } });
    expect(onScreenFont(cinzel)).toBe("cinzel");
    expect(onScreenFont({ ...cinzel, language: "vi" })).toBe("pangolin");
    expect(onScreenFont({ ...cinzel, language: "vi", visual: { ...cinzel.visual, font: "playfair" } })).toBe("playfair");
    expect(onScreenFont({ ...cinzel, language: "ja" })).toBe("yusei");
  });
});

describe("watermarkFor", () => {
  const on = { ...DEFAULT_BRANDING, enabled: true, text: "@barelyadulting" };
  it("is null when disabled, empty, or turned off for the target", () => {
    expect(watermarkFor(null, "long", null)).toBeNull();
    expect(watermarkFor({ ...on, enabled: false }, "long", null)).toBeNull();
    expect(watermarkFor({ ...on, text: "  " }, "long", null)).toBeNull();
    expect(watermarkFor({ ...on, onShorts: false }, "short", null)).toBeNull();
    expect(watermarkFor({ ...on, onLongVideo: false }, "long", null)).toBeNull();
  });
  it("returns the mark with clamped opacity, and allows logo-only", () => {
    expect(watermarkFor({ ...on, opacity: 5 }, "short", null)).toEqual({ text: "@barelyadulting", logoUrl: null, position: "bottom-right", opacity: 1 });
    expect(watermarkFor({ ...on, text: "" }, "long", "/api/media/logo.png")?.logoUrl).toBe("/api/media/logo.png");
  });
});
