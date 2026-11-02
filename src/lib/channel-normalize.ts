import type { AutoStep, ChannelProfile, LegacyFields, ProfileV1 } from "./channel";
import { FONT_OPTIONS, getLanguage } from "./languages";
import { AUTO_STEPS, DEFAULT_LENGTH, autopilotOf, pacingOf } from "./channel";
import { DEFAULT_OUTLINE_TEMPLATE } from "./outline-templates";

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Enforce the invariants the pipeline relies on, whatever Claude (or a user) produced:
 * unique angle ids, exactly one text-only concept frame, a "neutral" background,
 * a style lock that forbids image-model text, sane word counts and colors.
 */
export function normalizeProfile(input: ChannelProfile | ProfileV1): ChannelProfile {
  const p = migrateV1(input);
  const v = p.visual;

  // Keep existing ids (ideas reference them); give new or duplicate rows the next free id.
  const used = new Set<number>();
  let next = Math.max(0, ...p.topicAngles.map((a) => (Number.isInteger(a.id) ? a.id : 0))) + 1;
  const topicAngles = p.topicAngles
    .filter((a) => a.template.trim() || a.name.trim())
    .map((a) => {
      let id = a.id;
      if (!Number.isInteger(id) || id <= 0 || used.has(id)) id = next++;
      used.add(id);
      return { ...a, id, name: a.name.trim() || a.template.trim() };
    });

  let frameTypes = v.frameTypes.map((f) => ({ ...f, key: slugKey(f.key), textOnly: f.key === "concept_text" ? true : undefined }));
  frameTypes = frameTypes.filter((f, i) => frameTypes.findIndex((x) => x.key === f.key) === i);
  if (!frameTypes.some((f) => f.key === "concept_text")) {
    frameTypes.unshift({
      key: "concept_text",
      label: "Concept text",
      description: "Plain background with one big key phrase or number, drawn by code.",
      textOnly: true,
    });
  }
  if (!frameTypes.some((f) => !f.textOnly)) {
    frameTypes.push({ key: "character_scene", label: "Character scene", description: "The main character doing something concrete.", textOnly: undefined });
  }

  let backgrounds = v.backgrounds.map((b) => ({ ...b, key: slugKey(b.key) }));
  backgrounds = backgrounds.filter((b, i) => backgrounds.findIndex((x) => x.key === b.key) === i);
  if (!backgrounds.some((b) => b.key === "neutral")) {
    backgrounds.push({ key: "neutral", label: "Neutral", description: "plain light background", mood: "neutral / concept" });
  }

  let styleLock = v.styleLock.trim().replace(/\.$/, "");
  if (!/no text/i.test(styleLock)) styleLock += ", no text or letters";
  if (!/16:9/.test(styleLock)) styleLock += ", 16:9 widescreen";
  styleLock += ".";

  let styleAnchor = v.styleAnchor.trim();
  if (!styleAnchor.endsWith(",")) styleAnchor = styleAnchor.replace(/[.;]$/, "") + ",";

  const pace = pacingOf(p);
  const wpm = clamp(Math.round(pace.wordsPerMinute) || 170, 90, 260);
  const measuredWpm = pace.measuredWpm && Number.isFinite(pace.measuredWpm) ? clamp(Math.round(pace.measuredWpm), 60, 320) : undefined;
  // Length lives in minutes; older profiles only have words, read at the configured speed.
  const given =
    p.lengthMinutes ??
    (p.scriptWords ? { min: (Number(p.scriptWords.min) || 1500) / wpm, max: (Number(p.scriptWords.max) || 2400) / wpm } : DEFAULT_LENGTH);
  const minMin = clamp(roundQuarter(Number(given.min) || 1), 0.25, 60);
  const lengthMinutes = { min: minMin, max: clamp(roundQuarter(Number(given.max) || minMin), minMin, 60) };

  const ap = autopilotOf(p);
  const stopAfter: AutoStep = AUTO_STEPS.includes(ap.stopAfter) ? ap.stopAfter : "scenes";
  const stopIdx = AUTO_STEPS.indexOf(stopAfter);
  const autopilot = {
    stopAfter,
    pauseAfter: AUTO_STEPS.filter((s) => ap.pauseAfter.includes(s) && AUTO_STEPS.indexOf(s) < stopIdx),
    imageQuality: (["low", "medium", "high"] as const).includes(ap.imageQuality) ? ap.imageQuality : "low",
    captions: ap.captions !== false,
    kenBurns: ap.kenBurns !== false,
  };

  // Drop the derived word count; minutes are the only length setting now.
  const { scriptWords: _words, ...rest } = p;
  void _words;
  const template = p.outlineTemplate?.beats?.length ? p.outlineTemplate : DEFAULT_OUTLINE_TEMPLATE;
  return {
    ...rest,
    format: stripLength(p.format ?? ""),
    profileVersion: 2,
    autopilot,
    language: getLanguage(p.language).code,
    pacing: {
      maxWordsPerSentence: clamp(Math.round(pace.maxWordsPerSentence) || 14, 5, 40),
      wordsPerMinute: wpm,
      sentencesPerImage: clamp(Math.round(pace.sentencesPerImage) || 2, 1, 4),
      cameraCuts: pace.cameraCuts !== false,
      ...(measuredWpm ? { measuredWpm } : {}),
    },
    outlineTemplate: {
      name: template.name.trim() || "Custom",
      beats: template.beats
        .filter((b) => b.name.trim() || b.purpose.trim())
        .map((b, i) => ({ ...b, key: slugKey(b.key || b.name) || `beat_${i + 1}`, share: clamp(Math.round(b.share) || 5, 1, 60) })),
    },
    topicAngles,
    lengthMinutes,
    visual: {
      ...v,
      styleAnchor,
      styleLock,
      palette: v.palette.filter((c) => HEX.test(c.hex)).map((c) => ({ ...c, hex: c.hex.toUpperCase() })),
      textColor: v.textColor && HEX.test(v.textColor) ? v.textColor.toUpperCase() : undefined,
      paperColor: v.paperColor && HEX.test(v.paperColor) ? v.paperColor.toUpperCase() : undefined,
      captionColor: v.captionColor && HEX.test(v.captionColor) ? v.captionColor.toUpperCase() : undefined,
      font: v.font && FONT_OPTIONS.some((f) => f.key === v.font) ? v.font : undefined,
      frameTypes,
      backgrounds,
    },
  };
}

/**
 * v1 → v2: fields that duplicated something else are folded into the field that actually drives the pipeline,
 * and their original text is kept in `legacy`. Profiles already at v2 pass through untouched.
 */
export function migrateV1(input: ChannelProfile | ProfileV1): ChannelProfile {
  const old = input as ProfileV1;
  const { hookFormula, scriptRhythm, narrativeArc, ...top } = old;
  const { artStyle, objects, ...visual } = old.visual;
  if ((input.profileVersion ?? 1) >= 2) return { ...(top as ChannelProfile), visual };

  const legacy: LegacyFields = { ...(input.legacy ?? {}) };
  const keep = (k: keyof LegacyFields, v: string | undefined) => {
    if (v?.trim()) legacy[k] = v.trim();
  };
  keep("hookFormula", hookFormula);
  keep("scriptRhythm", scriptRhythm);
  keep("narrativeArc", narrativeArc);
  keep("artStyle", artStyle);
  keep("objects", objects);

  // The hook formula belongs to the outline's first part.
  let outlineTemplate = top.outlineTemplate?.beats?.length ? top.outlineTemplate : DEFAULT_OUTLINE_TEMPLATE;
  if (hookFormula?.trim()) {
    const [first, ...others] = outlineTemplate.beats;
    if (first && !first.guidance.includes(hookFormula.trim())) {
      const guidance = `${first.guidance.trim()} Hook: ${hookFormula.trim()}`.trim();
      outlineTemplate = { ...outlineTemplate, beats: [{ ...first, guidance }, ...others] };
    }
  }
  const extraScriptRules = [...(top.extraScriptRules ?? [])];
  if (scriptRhythm?.trim() && !extraScriptRules.some((r) => r.includes(scriptRhythm.trim()))) extraScriptRules.push(`Rhythm: ${scriptRhythm.trim()}`);
  const conceptDevices = [...(visual.conceptDevices ?? [])];
  if (objects?.trim() && !conceptDevices.some((d) => d.includes(objects.trim()))) conceptDevices.push(`Recurring props: ${objects.trim()}`);
  // styleAnchor is what images use; if it's empty, the old free-text art style is the best stand-in.
  const styleAnchor = visual.styleAnchor?.trim() ? visual.styleAnchor : (artStyle ?? "");

  return {
    ...(top as ChannelProfile),
    outlineTemplate,
    extraScriptRules,
    visual: { ...visual, styleAnchor, conceptDevices },
    ...(Object.keys(legacy).length ? { legacy } : {}),
    profileVersion: 2,
  };
}

/** Remove video length from a free-text format ("7–12 minute explainer" → "explainer"). Length is set in minutes elsewhere. */
export function stripLength(format: string) {
  return format
    .replace(/(\b(of|lasting|running|at)\s+)?\b(about|around|roughly|~)?\s*\d+(\.\d+)?\s*(\+|(–|-|—|to)\s*\d+(\.\d+)?)?[\s-]*(min(ute)?s?|mins?)\b(\s+long)?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/^[\s,;.-]+/, "")
    .replace(/([,;])\s*([,;.])/g, "$2")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function slugKey(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "custom";
}

function roundQuarter(n: number) {
  return Math.round(n * 4) / 4;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
