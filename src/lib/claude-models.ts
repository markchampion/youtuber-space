// Which Claude model runs each pipeline step. Shared by the server (routing) and the Settings page.

export const CLAUDE_MODELS = [
  { id: "claude-opus-5-5", label: "Opus 5.5", price: [4, 20] as const, note: "newest, most natural writing" },
  { id: "claude-opus-5", label: "Opus 5", price: [5, 25] as const, note: "previous Opus" },
  { id: "claude-sonnet-5", label: "Sonnet 5", price: [2, 10] as const, note: "~60% cheaper" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", price: [1, 5] as const, note: "cheapest" },
];
export type ClaudeModelId = (typeof CLAUDE_MODELS)[number]["id"];

/** $ per 1M tokens (input, output), including models only reachable via .env overrides. */
export const PRICES: Record<string, readonly [number, number]> = {
  ...Object.fromEntries(CLAUDE_MODELS.map((m) => [m.id, m.price])),
  "claude-fable-5-1": [10, 50],
};

export function modelLabel(id: string) {
  return CLAUDE_MODELS.find((m) => m.id === id)?.label ?? id;
}

export type ClaudeStep = "ideas" | "outline" | "script" | "polish" | "fact_check" | "scenes" | "metadata" | "shorts" | "channel";

/**
 * User-facing steps. `tokens` is a rough per-video estimate (input, output incl. thinking)
 * for a ~2,000-word script, used only for the cost estimate on the Settings page.
 */
export const CLAUDE_STEPS: { key: ClaudeStep; label: string; help: string; kinds: string[]; tokens: [number, number] }[] = [
  { key: "ideas", label: "Ideas & evaluation", help: "Idea batches and scorecards", kinds: ["ideas", "evaluate_idea"], tokens: [5000, 5000] },
  { key: "outline", label: "Outline", help: "Story structure and evidence", kinds: ["outline"], tokens: [2500, 2500] },
  { key: "script", label: "Script & rewrites", help: "The narration people hear", kinds: ["script", "rewrite"], tokens: [3500, 8000] },
  { key: "polish", label: "Natural-speech pass", help: "Rewrites the script so it sounds spoken, not written", kinds: ["polish"], tokens: [4500, 6000] },
  { key: "fact_check", label: "Fact check", help: "Flags names and claims to verify", kinds: ["fact_check"], tokens: [4500, 3000] },
  { key: "scenes", label: "Scenes & image prompts", help: "Groups sentences, describes each image", kinds: ["scenes"], tokens: [6000, 9000] },
  { key: "metadata", label: "Metadata", help: "Titles, description, tags", kinds: ["metadata"], tokens: [4500, 2500] },
  { key: "shorts", label: "Shorts", help: "Picks the best 30–60 s clips and writes their captions", kinds: ["shorts"], tokens: [4500, 2500] },
  { key: "channel", label: "Channel drafts", help: "One-off, when creating or rewriting a channel", kinds: ["channel_draft", "channel_rewrite"], tokens: [0, 0] },
];

export type ClaudePreset = "quality" | "balanced" | "cheapest" | "custom";
const O = "claude-opus-5-5";
const S = "claude-sonnet-5";
const H = "claude-haiku-4-5";

export const PRESETS: Record<Exclude<ClaudePreset, "custom">, { label: string; blurb: string; models: Record<ClaudeStep, ClaudeModelId> }> = {
  quality: {
    label: "Best quality",
    blurb: "Opus 5.5 for every step.",
    models: { ideas: O, outline: O, script: O, polish: O, fact_check: O, scenes: O, metadata: O, shorts: O, channel: O },
  },
  balanced: {
    label: "Balanced",
    blurb: "Opus 5.5 for outline, script and the natural-speech pass; Sonnet 5 for the rest.",
    models: { ideas: S, outline: O, script: O, polish: O, fact_check: S, scenes: S, metadata: S, shorts: S, channel: S },
  },
  cheapest: {
    label: "Cheapest",
    blurb: "Sonnet 5 for outline, script and fact check; Haiku 4.5 for the rest.",
    models: { ideas: H, outline: S, script: S, polish: S, fact_check: S, scenes: H, metadata: H, shorts: H, channel: S },
  },
};

export function stepForKind(kind: string): ClaudeStep {
  return CLAUDE_STEPS.find((s) => s.kinds.includes(kind))?.key ?? "script";
}

/** Resolve the model for a step. `custom` entries fall back to the Balanced preset. */
export function resolveModel(step: ClaudeStep, preset: ClaudePreset, custom: Partial<Record<ClaudeStep, string>>): string {
  if (preset === "custom") return custom[step] || PRESETS.balanced.models[step];
  return (PRESETS[preset] ?? PRESETS.balanced).models[step];
}

/** Estimated Claude cost ($) of one video with the given step → model mapping. */
export function estimateVideoCost(models: Record<ClaudeStep, string>): number {
  return CLAUDE_STEPS.reduce((sum, s) => {
    const [inP, outP] = PRICES[models[s.key]] ?? [5, 25];
    return sum + (s.tokens[0] * inP + s.tokens[1] * outP) / 1e6;
  }, 0);
}

export function customKey(step: ClaudeStep) {
  return `CLAUDE_MODEL_${step.toUpperCase()}` as const;
}
