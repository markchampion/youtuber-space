import { pickFont, type FontKey } from "./languages";
export type TopicAngle = { id: number; name: string; template: string; description: string };

/** One step of a video's structure. `share` is the rough % of the video it should take. */
export type OutlineBeat = { key: string; name: string; purpose: string; guidance: string; share: number };
export type OutlineTemplate = { name: string; beats: OutlineBeat[] };

export type Pacing = {
  maxWordsPerSentence: number; // script rule + long-sentence check
  wordsPerMinute: number; // duration estimates
  sentencesPerImage: number; // how many sentences share one generated image
  cameraCuts: boolean; // cut to a new framing of the image at every sentence
  /** Real speaking speed of the channel's voice, measured from the last voiced video. Cleared when the voice or its speed changes. */
  measuredWpm?: number;
};

export const DEFAULT_PACING: Pacing = { maxWordsPerSentence: 14, wordsPerMinute: 170, sentencesPerImage: 2, cameraCuts: true };
export type Background = { key: string; label: string; description: string; mood: string };
export type FrameType = { key: string; label: string; description: string; textOnly?: boolean };

/** What a channel makes. Long-form = idea → script → … → 16:9 video. Product ad = 15–20 s 9:16 ad from a product photo. */
export type ChannelKind = "longform" | "product_ad";
export const CHANNEL_KINDS: { key: ChannelKind; label: string }[] = [
  { key: "longform", label: "Long-form video" },
  { key: "product_ad", label: "Product ad" },
];

export type ChannelProfile = {
  /** Missing means "longform" (every channel made before product ads). */
  kind?: ChannelKind;
  name: string;
  /** Language of everything the audience sees or hears (BCP-47, see src/lib/languages.ts). Defaults to English. */
  language?: string;
  /** 1–3 paragraphs of narration in the exact voice wanted; the AI copies its tone, not its content. */
  voiceSample?: string;
  /** Run a second "natural spoken language" pass after writing the script. Defaults on for non-English. */
  polishPass?: boolean;
  pacing?: Pacing;
  /** Structure every outline follows (see src/lib/outline-templates.ts). */
  outlineTemplate?: OutlineTemplate;
  niche: string;
  /** Kind of video, e.g. "educational explainer, doodle animation". Never a length: that's `lengthMinutes`. */
  format: string;
  voice: string;
  evidenceRule: string;
  extraScriptRules: string[];
  /** Target video length, the only length setting. Word counts come from it and the speaking speed (see lengthBudget). */
  lengthMinutes?: { min: number; max: number };
  /** @deprecated Older profiles stored words instead of minutes; only read to migrate them. */
  scriptWords?: { min: number; max: number };
  /** Optional title formulas for idea generation. Empty is fine: the AI invents its own. */
  topicAngles: TopicAngle[];
  visual: {
    /** Art style: starts every image prompt, and is the visual style the text prompts are told about. */
    styleAnchor: string;
    /** Things to always avoid: ends every image prompt. */
    styleLock: string;
    mainCharacter: string;
    characterVariants: string[];
    conceptDevices: string[];
    palette: { name: string; hex: string }[];
    /** Hex colors for code-drawn text; fall back to palette names containing "red" / "cream". */
    textColor?: string;
    paperColor?: string;
    /** Color of Short captions drawn on the paper (stacked layout). Unset = auto: white or near-black, whichever reads on the paper. */
    captionColor?: string;
    /** Font for on-screen text (text over images, text frames, Short titles). Unset = the language's default. */
    font?: FontKey;
    backgrounds: Background[];
    frameTypes: FrameType[];
  };
  metadataRules: string;
  /** What a project's one-click Autopilot runs and where it stops for review. */
  autopilot?: AutopilotConfig;
  /** 2 = merged settings (hook in the outline, art style in styleAnchor, one length field). Missing means 1. */
  profileVersion?: number;
  /** Text from fields that were merged away in v2, kept so nothing is lost. Shown read-only until dismissed. */
  legacy?: LegacyFields;
};

export type LegacyFields = { hookFormula?: string; scriptRhythm?: string; narrativeArc?: string; artStyle?: string; objects?: string };

/** A v1 profile as stored before the merge. normalizeProfile accepts either. */
export type ProfileV1 = Omit<ChannelProfile, "visual"> & {
  hookFormula?: string;
  scriptRhythm?: string;
  narrativeArc?: string;
  visual: ChannelProfile["visual"] & { artStyle?: string; objects?: string };
};

export const DEFAULT_LENGTH = { min: 8, max: 12 };

// ---------- Autopilot ----------

/** Steps Autopilot can run, in order. */
export const AUTO_STEPS = ["outline", "script", "voice", "scenes", "images", "render"] as const;
export type AutoStep = (typeof AUTO_STEPS)[number];
export const AUTO_STEP_LABELS: Record<AutoStep, string> = {
  outline: "Outline",
  script: "Script",
  voice: "Voice",
  scenes: "Scenes",
  images: "Images",
  render: "Render",
};

export type AutopilotConfig = {
  stopAfter: AutoStep;
  /** Steps after which Autopilot waits for you to review and press Continue. */
  pauseAfter: AutoStep[];
  imageQuality: "low" | "medium" | "high";
  captions: boolean;
  kenBurns: boolean;
};

export const DEFAULT_AUTOPILOT: AutopilotConfig = {
  stopAfter: "scenes",
  pauseAfter: ["outline", "script"],
  imageQuality: "low",
  captions: true,
  kenBurns: true,
};

/** A project's Autopilot run. Stored on projects.autopilot; null = never run. */
export type AutopilotState = {
  status: "running" | "paused" | "done" | "error" | "stopped";
  /** The step it's on, paused after, or failed at. */
  step: AutoStep;
  /** First step of this run (a re-voice starts at "voice"). */
  from: AutoStep;
  /** Settings frozen at start, so channel edits mid-run don't change it. */
  config: AutopilotConfig;
  baseUrl: string;
  error?: string;
  pausedReason?: string;
  startedAt: string;
  /** Set by the API, not stored: the state says running but no Autopilot job is alive (e.g. the server restarted). */
  interrupted?: boolean;
};

/** A voice for one video only; anything missing falls back to the channel's. */
export type VoiceOverride = { voiceId?: string | null; settings?: VoiceSettings | null };

export function channelKind(p: ChannelProfile): ChannelKind {
  return p.kind === "product_ad" ? "product_ad" : "longform";
}
export const isAdChannel = (p: ChannelProfile) => channelKind(p) === "product_ad";

export function autopilotOf(p: ChannelProfile): AutopilotConfig {
  return { ...DEFAULT_AUTOPILOT, ...(p.autopilot ?? {}) };
}

export type VoiceSettings = {
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0,
  speed: 1,
};

export function angleName(profile: ChannelProfile, id: number | null | undefined) {
  if (id === 0) return "Fresh angle";
  return profile.topicAngles.find((a) => a.id === id)?.name ?? "—";
}

export function paletteHex(profile: ChannelProfile, name: string, fallback: string) {
  return profile.visual.palette.find((p) => p.name.toLowerCase().includes(name.toLowerCase()))?.hex ?? fallback;
}

/** Font for code-drawn on-screen text; falls back to the language's font when the chosen one lacks its letters. */
export function onScreenFont(profile: ChannelProfile): FontKey {
  return pickFont(profile.visual.font, profile.language);
}

/** Colors for code-drawn text frames and overlays. */
export function textColors(profile: ChannelProfile) {
  return {
    text: profile.visual.textColor ?? paletteHex(profile, "red", "#E0302B"),
    paper: profile.visual.paperColor ?? paletteHex(profile, "cream", "#F5F1E6"),
  };
}

// ---------- Branding / watermark ----------

export type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type Branding = {
  enabled: boolean;
  text: string; // e.g. "@barelyadulting"
  logoPath: string | null; // stored media path (transparent PNG)
  position: WatermarkPosition; // long video only; Shorts use a fixed safe spot
  opacity: number; // 0.3–1
  onLongVideo: boolean;
  onShorts: boolean;
};

export const DEFAULT_BRANDING: Branding = {
  enabled: false,
  text: "",
  logoPath: null,
  position: "bottom-right",
  opacity: 0.7,
  onLongVideo: true,
  onShorts: true,
};

export type Watermark = { text: string; logoUrl: string | null; position: WatermarkPosition; opacity: number };

/** The watermark a render should draw, or null. `logoUrl` is the already-resolved URL of `logoPath`. */
export function watermarkFor(branding: Branding | null | undefined, target: "long" | "short", logoUrl: string | null): Watermark | null {
  const b = { ...DEFAULT_BRANDING, ...(branding ?? {}) };
  if (!b.enabled) return null;
  if (target === "long" ? !b.onLongVideo : !b.onShorts) return null;
  const text = b.text.trim();
  if (!text && !logoUrl) return null;
  return { text, logoUrl, position: b.position, opacity: Math.max(0.3, Math.min(1, b.opacity)) };
}

/** Whether the natural-speech polish pass runs after the script is written. */
export function polishEnabled(p: ChannelProfile) {
  return p.polishPass ?? (p.language ?? "en") !== "en";
}

export function pacingOf(p: ChannelProfile): Pacing {
  return { ...DEFAULT_PACING, ...(p.pacing ?? {}) };
}

/** Speaking speed used for length maths: the voice's measured speed when known, else the configured one. */
export function effectiveWpm(p: ChannelProfile): number {
  const pace = pacingOf(p);
  return pace.measuredWpm ?? pace.wordsPerMinute;
}

export type LengthBudget = {
  minMinutes: number;
  maxMinutes: number;
  wpm: number;
  measured: boolean; // wpm comes from the real voice
  minWords: number;
  maxWords: number;
  targetWords: number; // what prompts aim for, a bit under the max so drafts land inside it
};

/** Channel length in minutes turned into word counts at the voice's speaking speed. */
export function lengthBudget(p: ChannelProfile): LengthBudget {
  const pace = pacingOf(p);
  const wpm = effectiveWpm(p);
  // Older profiles only have word counts: read them as minutes at the configured speed.
  const quarter = (n: number) => Math.max(0.25, Math.round(n * 4) / 4);
  const words = p.scriptWords;
  const minutes =
    p.lengthMinutes ?? (words ? { min: quarter(words.min / pace.wordsPerMinute), max: quarter(words.max / pace.wordsPerMinute) } : DEFAULT_LENGTH);
  const minWords = Math.round(minutes.min * wpm);
  const maxWords = Math.max(minWords + 10, Math.round(minutes.max * wpm));
  return {
    minMinutes: minutes.min,
    maxMinutes: minutes.max,
    wpm,
    measured: pace.measuredWpm != null,
    minWords,
    maxWords,
    targetWords: Math.round(Math.max(minWords, maxWords * 0.9)),
  };
}

/** A script this far over the max gets an automatic trim pass. */
export const TRIM_TOLERANCE = 1.05;
export function needsTrim(words: number, budget: LengthBudget) {
  return words > budget.maxWords * TRIM_TOLERANCE;
}
