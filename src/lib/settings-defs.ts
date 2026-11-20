// Shared by the server (resolution) and the Settings page (rendering).
/** "auto" = each step's built-in effort (high for outline, script and polish; medium for the rest). */
export const CLAUDE_EFFORTS = ["low", "medium", "high", "auto"] as const;
export type ClaudeEffortSetting = (typeof CLAUDE_EFFORTS)[number];
import { CLAUDE_MODELS, CLAUDE_STEPS, customKey } from "./claude-models";

export type SettingKey =
  | "ANTHROPIC_API_KEY"
  | "ELEVENLABS_API_KEY"
  | "OPENAI_API_KEY"
  | "CLAUDE_MODEL"
  | "CLAUDE_BACKEND"
  | "IMAGE_BACKEND"
  | "TTS_BACKEND"
  | "LOCAL_TTS_URL"
  | "LOCAL_TTS_API_KEY"
  | "LOCAL_TTS_SAMPLE_RATE"
  | "UI_LANGUAGE"
  | "CLAUDE_CLI_PATH"
  | "CODEX_CLI_PATH"
  | "CODEX_TEXT_MODEL"
  | "CLAUDE_PRESET"
  | "CLAUDE_EFFORT"
  | ReturnType<typeof customKey>
  | "ELEVENLABS_MODEL"
  | "ELEVENLABS_OUTPUT_FORMAT"
  | "OPENAI_IMAGE_MODEL"
  | "IMAGE_CONCURRENCY"
  | "VOICE_CONCURRENCY"
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
  {
    key: "CLAUDE_EFFORT",
    label: "Thinking effort",
    help: "How hard Claude thinks before writing. Higher is slower and uses more of your plan or budget.",
    default: "medium",
    options: CLAUDE_EFFORTS.map((v) => ({ value: v, label: v })),
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
    key: "VOICE_CONCURRENCY",
    label: "Parallel voice requests",
    help: "How many paragraphs are voiced at once. ElevenLabs allows 2 (Free) to 10+ (Pro) at a time; lower this if it returns rate-limit errors. A local TTS server may not get faster above 1-2.",
    default: "1",
    options: ["1", "2", "3", "4", "6", "8"].map((v) => ({ value: v, label: v })),
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
  {
    key: "TTS_BACKEND",
    label: "Voice connection",
    help: "ElevenLabs API key (pay per character) or a local TTS server on this machine (VieNeu-TTS, free).",
    default: "api",
    options: [
      { value: "api", label: "API key" },
      { value: "local", label: "Local TTS (VieNeu)" },
    ],
  },
  {
    key: "LOCAL_TTS_URL",
    label: "Local TTS server",
    help: "OpenAI-compatible speech server. VieNeu: `uv run python -m apps.openai_speech` listens on port 8000.",
    default: "http://127.0.0.1:8000/v1",
  },
  { key: "LOCAL_TTS_API_KEY", label: "Local TTS key", help: "Only if the server sets VIENEU_API_KEY.", default: "", secret: true },
  {
    key: "LOCAL_TTS_SAMPLE_RATE",
    label: "Local TTS audio quality",
    help: "VieNeu speaks at 48 kHz natively.",
    default: "24000",
    options: [
      { value: "24000", label: "24 kHz" },
      { value: "48000", label: "48 kHz (native)" },
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

export const UI_LANGUAGE: SettingDef = {
  key: "UI_LANGUAGE",
  label: "App language",
  help: "Language of the app's own buttons and labels. Each channel's videos keep their own language.",
  default: "en",
  options: [
    { value: "en", label: "English" },
    { value: "vi", label: "Tiếng Việt" },
  ],
};

export const ALL_SETTINGS: SettingDef[] = [...API_KEYS, ...BACKEND_SETTINGS, ...CLAUDE_SETTINGS, ...MODEL_SETTINGS, DRY_RUN, UI_LANGUAGE];

export type SettingSource = "saved" | "env" | "default";
export type PublicSetting = { key: SettingKey; value: string; source: SettingSource; isSet: boolean };
