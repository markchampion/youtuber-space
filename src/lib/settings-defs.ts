// Shared by the server (resolution) and the Settings page (rendering).
import { CLAUDE_MODELS, CLAUDE_STEPS, customKey } from "./claude-models";

export type SettingKey =
  | "ANTHROPIC_API_KEY"
  | "ELEVENLABS_API_KEY"
  | "OPENAI_API_KEY"
  | "CLAUDE_MODEL"
  | "CLAUDE_BACKEND"
  | "IMAGE_BACKEND"
  | "CLAUDE_CLI_PATH"
  | "CODEX_CLI_PATH"
  | "CODEX_TEXT_MODEL"
  | "CLAUDE_PRESET"
  | ReturnType<typeof customKey>
  | "ELEVENLABS_MODEL"
  | "ELEVENLABS_OUTPUT_FORMAT"
  | "OPENAI_IMAGE_MODEL"
  | "IMAGE_CONCURRENCY"
  | "RENDER_CONCURRENCY"
  | "DRY_RUN";

export type SettingDef = {
  key: SettingKey;
  label: string;
  help: string;
  default: string;
  secret?: boolean;
  link?: { href: string; label: string };
  options?: { value: string; label: string }[];
};

export const API_KEYS: SettingDef[] = [
  {
    key: "ANTHROPIC_API_KEY",
    label: "Anthropic (Claude)",
    help: "Ideas, scripts, fact checks, scenes and metadata. Billed separately from a Claude.ai subscription.",
    default: "",
    secret: true,
    link: { href: "https://console.anthropic.com/settings/keys", label: "Get a key" },
  },
  {
    key: "ELEVENLABS_API_KEY",
    label: "ElevenLabs",
    help: "Narration voice with word timings.",
    default: "",
    secret: true,
    link: { href: "https://elevenlabs.io/app/settings/api-keys", label: "Get a key" },
  },
  {
    key: "OPENAI_API_KEY",
    label: "OpenAI",
    help: "Scene images, character sheets and thumbnails. Billed separately from ChatGPT.",
    default: "",
    secret: true,
    link: { href: "https://platform.openai.com/api-keys", label: "Get a key" },
  },
];

/** Claude routing: a preset, or per-step models when the preset is "custom". Rendered by a dedicated card. */
export const CLAUDE_SETTINGS: SettingDef[] = [
  {
    key: "CLAUDE_PRESET",
    label: "Claude models",
    help: "Which Claude model writes each step.",
    default: "balanced",
    options: ["quality", "balanced", "cheapest", "custom"].map((v) => ({ value: v, label: v })),
  },
  ...CLAUDE_STEPS.map((s) => ({
    key: customKey(s.key),
    label: s.label,
    help: s.help,
    default: "",
    options: CLAUDE_MODELS.map((m) => ({ value: m.id, label: m.label })),
  })),
  {
    // Legacy single-model setting from .env.local; only used to pick the default preset.
    key: "CLAUDE_MODEL",
    label: "Claude model (legacy)",
    help: "",
    default: "",
  },
];

export const MODEL_SETTINGS: SettingDef[] = [
  {
    key: "OPENAI_IMAGE_MODEL",
    label: "Image model",
    help: "Quality (draft/final) is chosen per image in the Images step.",
    default: "gpt-image-2",
    options: [
      { value: "gpt-image-2", label: "gpt-image-2" },
      { value: "gpt-image-1.5", label: "gpt-image-1.5" },
      { value: "gpt-image-1", label: "gpt-image-1" },
      { value: "gpt-image-1-mini", label: "gpt-image-1-mini — cheapest" },
    ],
  },
  {
    key: "ELEVENLABS_MODEL",
    label: "Voice model",
    help: "Changing it marks every paragraph for re-voicing.",
    default: "eleven_multilingual_v2",
    options: [
      { value: "eleven_multilingual_v2", label: "Multilingual v2 — most natural (no Vietnamese)" },
      { value: "eleven_turbo_v2_5", label: "Turbo v2.5 — faster, cheaper, supports Vietnamese" },
      { value: "eleven_flash_v2_5", label: "Flash v2.5 — fastest, cheapest, supports Vietnamese" },
    ],
  },
  {
    key: "ELEVENLABS_OUTPUT_FORMAT",
    label: "Audio quality",
    help: "Raw PCM keeps voice/image sync exact. 44.1 kHz needs an ElevenLabs Pro plan.",
    default: "pcm_24000",
    options: [
      { value: "pcm_24000", label: "24 kHz (all plans)" },
      { value: "pcm_44100", label: "44.1 kHz (Pro plan)" },
    ],
  },
  {
    key: "IMAGE_CONCURRENCY",
    label: "Parallel image requests",
    help: "Lower this if OpenAI returns rate-limit errors.",
    default: "4",
    options: ["1", "2", "4", "6", "8"].map((v) => ({ value: v, label: v })),
  },
  {
    key: "RENDER_CONCURRENCY",
    label: "Parallel video renders",
    help: "Each MP4 render runs a headless Chrome. Batches queue renders beyond this number. Raise it only on a fast machine.",
    default: "1",
    options: ["1", "2", "3"].map((v) => ({ value: v, label: v })),
  },
];

/** Where AI calls go: pay-per-use API keys, or the local CLIs logged in to the user's subscriptions. */
export const BACKEND_SETTINGS: SettingDef[] = [
  {
    key: "CLAUDE_BACKEND",
    label: "Text connection",
    help: "Anthropic API key (pay per use), Claude Code CLI (your Claude plan), or Codex CLI (your ChatGPT plan, if you have no Claude plan).",
    default: "api",
    options: [
      { value: "api", label: "API key" },
      { value: "cli", label: "Claude Code (my plan)" },
      { value: "codex", label: "Codex (my ChatGPT plan)" },
    ],
  },
  {
    key: "IMAGE_BACKEND",
    label: "Image connection",
    help: "OpenAI API key (pay per image) or Codex CLI (your ChatGPT plan).",
    default: "api",
    options: [
      { value: "api", label: "API key" },
      { value: "codex", label: "Codex (my ChatGPT plan)" },
    ],
  },
  { key: "CLAUDE_CLI_PATH", label: "Claude CLI path", help: "Leave empty to auto-detect.", default: "" },
  { key: "CODEX_CLI_PATH", label: "Codex CLI path", help: "Leave empty to auto-detect.", default: "" },
  { key: "CODEX_TEXT_MODEL", label: "Codex model for text", help: "Leave empty to use Codex's default model.", default: "" },
];

export const DRY_RUN: SettingDef = {
  key: "DRY_RUN",
  label: "Dry run",
  help: "Placeholder text, audio and images. No API calls, no cost. Useful for trying the workflow.",
  default: "0",
};

export const ALL_SETTINGS: SettingDef[] = [...API_KEYS, ...BACKEND_SETTINGS, ...CLAUDE_SETTINGS, ...MODEL_SETTINGS, DRY_RUN];

export type SettingSource = "saved" | "env" | "default";
export type PublicSetting = { key: SettingKey; value: string; source: SettingSource; isSet: boolean };
