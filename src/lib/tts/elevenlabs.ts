import "server-only";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { env, sampleRateFromFormat } from "@/lib/env";
import type { VoiceSettings } from "@/lib/channel";
import { recordCost } from "@/lib/costs";
import { buildSpokenText, sentenceTimesFromAlignment, splitSentences, wordCount, type TimeSpan } from "@/lib/sync";
import { fakeSpeech } from "./wav";

let client: { key: string; api: ElevenLabsClient } | null = null;
function getClient() {
  const key = env.elevenLabsKey;
  if (!key) throw new Error("ElevenLabs API key is not set. Add it in Settings (or turn on dry run).");
  if (client?.key !== key) client = { key, api: new ElevenLabsClient({ apiKey: key }) };
  return client.api;
}

export type SynthResult = {
  pcm: Buffer; // 16-bit mono
  sampleRate: number;
  sampleCount: number;
  sentenceTimes: TimeSpan[]; // relative to paragraph start
};

// Rough $ per character on a paid ElevenLabs plan, used only for the cost meter.
const USD_PER_CHAR = 0.00018;

export async function synthesizeParagraph(opts: {
  text: string;
  voiceId: string;
  settings: VoiceSettings;
  pronunciations: Record<string, string>;
  previousText?: string;
  nextText?: string;
  projectId: string;
  locale?: string; // must match the locale used when the script was split into sentences
}): Promise<SynthResult> {
  const sentences = splitSentences(opts.text, opts.locale).map((s) => s.text);
  const spoken = buildSpokenText(sentences, opts.pronunciations);
  const sampleRate = sampleRateFromFormat(env.elevenLabsOutputFormat);

  if (env.dryRun) {
    const durations = sentences.map((s) => Math.max(1.2, wordCount(s, opts.locale) * 0.4));
    const pcm = fakeSpeech(durations, sampleRate);
    let t = 0;
    const sentenceTimes = durations.map((d) => {
      const span = { start: t, end: t + d * 0.85 };
      t += d;
      return span;
    });
    return { pcm, sampleRate, sampleCount: pcm.length / 2, sentenceTimes };
  }

  const res = await getClient().textToSpeech.convertWithTimestamps(opts.voiceId, {
    text: spoken.text,
    modelId: env.elevenLabsModel,
    // Without this the model guesses the language per paragraph, and Vietnamese with English names or loanwords
    // can get read with the wrong rules. Multilingual v2 rejects the field (and doesn't support Vietnamese anyway).
    ...(opts.locale && !env.elevenLabsModel.startsWith("eleven_multilingual") ? { languageCode: opts.locale } : {}),
    outputFormat: env.elevenLabsOutputFormat,
    voiceSettings: {
      stability: opts.settings.stability,
      similarityBoost: opts.settings.similarityBoost,
      style: opts.settings.style,
      speed: opts.settings.speed,
    },
    // Neighbouring text keeps prosody continuous across separately voiced paragraphs.
    previousText: opts.previousText,
    nextText: opts.nextText,
  }).catch(readableError);

  const pcm = Buffer.from(res.audioBase64, "base64");
  const sampleCount = Math.floor(pcm.length / 2);
  const duration = sampleCount / sampleRate;
  // `alignment` is keyed to the text we sent (not the normalized text).
  const alignment = res.alignment ?? res.normalizedAlignment;
  const sentenceTimes = alignment
    ? sentenceTimesFromAlignment(spoken.text, spoken.ranges, alignment, duration)
    : sentenceTimesFromAlignment(spoken.text, spoken.ranges, { characters: [], characterStartTimesSeconds: [], characterEndTimesSeconds: [] }, duration);

  recordCost(opts.projectId, "elevenlabs", "tts", spoken.text.length * USD_PER_CHAR);
  return { pcm: pcm.subarray(0, sampleCount * 2), sampleRate, sampleCount, sentenceTimes };
}

export type VoiceOption = {
  id: string;
  name: string;
  description?: string;
  previewUrl?: string;
  labels?: Record<string, string>;
  languages: string[]; // ISO codes the voice is verified for (e.g. "vi")
};

export async function listVoices(): Promise<VoiceOption[]> {
  if (env.dryRun || !env.elevenLabsKey) {
    return [{ id: "dry-run-voice", name: "Placeholder voice (DRY_RUN)", description: "Soft tones instead of speech", languages: [] }];
  }
  const res = await getClient().voices.getAll();
  return res.voices.map((v) => ({
    id: v.voiceId,
    name: v.name ?? v.voiceId,
    description: v.description,
    previewUrl: v.previewUrl,
    labels: v.labels,
    languages: [...new Set((v.verifiedLanguages ?? []).map((l) => l.language.toLowerCase().split("-")[0]))],
  }));
}

export type LibraryVoice = {
  publicOwnerId: string;
  voiceId: string;
  name: string;
  accent?: string;
  gender?: string;
  age?: string;
  descriptive?: string;
  useCase?: string;
  description?: string;
  previewUrl?: string;
  locale?: string;
  clonedByCount: number;
  /** Characters spoken with this voice across ElevenLabs in the last year / 7 days. */
  usage1y: number;
  usage7d: number;
  freeUsersAllowed: boolean;
  fiatRate?: number; // extra USD per 1,000 credits (~1,000 characters) some professional voices charge on top of the plan
  isAddedByUser: boolean;
};

/** Voice Library sort orders the API accepts. */
export const LIBRARY_SORTS = ["usage_character_count_1y", "trending", "cloned_by_count", "created_date"] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

/** Search the public ElevenLabs Voice Library (free, no credits). */
export async function searchLibraryVoices(opts: {
  language: string;
  gender?: string;
  search?: string;
  page?: number;
  sort?: string | null;
}): Promise<{ voices: LibraryVoice[]; hasMore: boolean; plan: string | null }> {
  if (env.dryRun || !env.elevenLabsKey) {
    return {
      plan: null,
      voices: [{ publicOwnerId: "dry-run", voiceId: "dry-run-voice", name: "Placeholder library voice (DRY_RUN)", clonedByCount: 0, usage1y: 0, usage7d: 0, freeUsersAllowed: true, isAddedByUser: false }],
      hasMore: false,
    };
  }
  const res = await getClient()
    .voices.getShared({
      language: opts.language,
      gender: opts.gender || undefined,
      search: opts.search?.trim() || undefined,
      page: opts.page ?? 0,
      pageSize: 30,
      sort: LIBRARY_SORTS.includes(opts.sort as LibrarySort) ? (opts.sort as LibrarySort) : "usage_character_count_1y",
    })
    .catch(readableError);
  return {
    plan: await planTier(),
    hasMore: res.hasMore,
    voices: res.voices.map((v) => ({
      publicOwnerId: v.publicOwnerId,
      voiceId: v.voiceId,
      name: v.name,
      accent: v.accent || undefined,
      gender: v.gender || undefined,
      age: v.age || undefined,
      descriptive: v.descriptive || undefined,
      useCase: v.useCase || undefined,
      description: v.description,
      previewUrl: v.previewUrl,
      locale: v.locale,
      clonedByCount: v.clonedByCount,
      usage1y: v.usageCharacterCount1Y ?? 0,
      usage7d: v.usageCharacterCount7D ?? 0,
      freeUsersAllowed: v.freeUsersAllowed,
      fiatRate: v.fiatRate ?? undefined,
      isAddedByUser: Boolean(v.isAddedByUser),
    })),
  };
}

let tierCache: { key: string; tier: string | null; at: number } | null = null;
/** The account's ElevenLabs plan ("free", "starter", "creator", …), cached for 10 minutes. Null if unknown. */
async function planTier(): Promise<string | null> {
  const key = env.elevenLabsKey ?? "";
  if (tierCache?.key === key && Date.now() - tierCache.at < 10 * 60_000) return tierCache.tier;
  const tier = await getClient()
    .user.subscription.get()
    .then((s) => s.tier ?? null)
    .catch(() => null); // the key may lack the user_read permission
  tierCache = { key, tier, at: Date.now() };
  return tier;
}

/** Add a library voice to the account so TTS can use it. Returns the account voice id. */
export async function addLibraryVoice(publicOwnerId: string, voiceId: string, name: string): Promise<string> {
  if (env.dryRun || !env.elevenLabsKey) return "dry-run-voice";
  const res = await getClient().voices.share(publicOwnerId, voiceId, { newName: name }).catch(readableError);
  return res.voiceId;
}

/** ElevenLabs errors carry the useful message in `body.detail`. */
function readableError(e: unknown): never {
  const body = (e as { body?: { detail?: { message?: string; status?: string } | string } }).body;
  const detail = typeof body?.detail === "string" ? body.detail : body?.detail?.message;
  const code = typeof body?.detail === "object" ? (body.detail as { code?: string }).code : undefined;
  if (code === "paid_plan_required")
    throw new Error(
      "ElevenLabs: this is a Voice Library voice, and the Free plan can't use library voices from apps. Pick one of your default voices in the Narrator list, or upgrade to a paid ElevenLabs plan (Starter or above).",
    );
  if (detail && /limit/i.test(detail)) throw new Error(`ElevenLabs: ${detail} Remove an unused voice in your ElevenLabs account (Voices → My voices) and try again.`);
  throw new Error(detail ? `ElevenLabs: ${detail}` : e instanceof Error ? e.message : String(e));
}
