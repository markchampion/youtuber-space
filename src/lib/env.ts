import { getSetting } from "@/lib/settings";
import { CLAUDE_STEPS, customKey, resolveModel, stepForKind, type ClaudePreset, type ClaudeStep } from "@/lib/claude-models";

/** The Claude model for a call `kind` (e.g. "script", "scenes"), per the Settings preset. */
export function modelFor(kindOrStep: string): string {
  const preset = getSetting("CLAUDE_PRESET") as ClaudePreset;
  const custom = Object.fromEntries(CLAUDE_STEPS.map((s) => [s.key, getSetting(customKey(s.key))])) as Record<ClaudeStep, string>;
  const step = CLAUDE_STEPS.some((s) => s.key === kindOrStep) ? (kindOrStep as ClaudeStep) : stepForKind(kindOrStep);
  return resolveModel(step, preset, custom);
}

/** Live config: reads the Settings page values (falling back to .env.local) on every access. */
export const env = {
  get anthropicKey() {
    return getSetting("ANTHROPIC_API_KEY");
  },
  get elevenLabsKey() {
    return getSetting("ELEVENLABS_API_KEY");
  },
  get openaiKey() {
    return getSetting("OPENAI_API_KEY");
  },
  get elevenLabsModel() {
    return getSetting("ELEVENLABS_MODEL");
  },
  get elevenLabsOutputFormat() {
    return getSetting("ELEVENLABS_OUTPUT_FORMAT") as "pcm_16000" | "pcm_22050" | "pcm_24000" | "pcm_44100";
  },
  get imageModel() {
    return getSetting("OPENAI_IMAGE_MODEL");
  },
  get renderConcurrency() {
    return Math.max(1, Number(getSetting("RENDER_CONCURRENCY")) || 1);
  },
  get imageConcurrency() {
    return Math.max(1, Number(getSetting("IMAGE_CONCURRENCY")) || 4);
  },
  /** Where text is written: Anthropic API, Claude Code CLI, or Codex CLI (for people without a Claude plan). */
  get claudeBackend() {
    const v = getSetting("CLAUDE_BACKEND");
    return v === "cli" || v === "codex" ? v : ("api" as const);
  },
  get codexTextModel() {
    return getSetting("CODEX_TEXT_MODEL");
  },
  get imageBackend() {
    return getSetting("IMAGE_BACKEND") === "codex" ? ("codex" as const) : ("api" as const);
  },
  get claudeCliPath() {
    return getSetting("CLAUDE_CLI_PATH");
  },
  get codexCliPath() {
    return getSetting("CODEX_CLI_PATH");
  },
  get dryRun() {
    const v = getSetting("DRY_RUN").toLowerCase();
    return v === "1" || v === "true";
  },
};

export function sampleRateFromFormat(format: string): number {
  const n = Number(format.split("_")[1]);
  return Number.isFinite(n) && n > 0 ? n : 24000;
}

/** A provider counts as configured when its key is set or it runs through a subscription CLI. */
export function keyStatus() {
  return {
    anthropic: env.claudeBackend !== "api" || Boolean(env.anthropicKey),
    elevenlabs: Boolean(env.elevenLabsKey),
    openai: env.imageBackend === "codex" || Boolean(env.openaiKey),
    dryRun: env.dryRun,
  };
}
