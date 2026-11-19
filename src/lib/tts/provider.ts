import "server-only";
import { env, sampleRateFromFormat } from "@/lib/env";
import { buildSpokenText, splitSentences, wordCount } from "@/lib/sync";
import * as elevenlabs from "./elevenlabs";
import { listLocalVoices, pingLocalTts, synthesizeSentences, type LocalTtsConfig } from "./local-core";
import type { SynthOpts, SynthResult, TtsBackend, TtsProvider, VoiceOption } from "./types";
import { fakeSpeech } from "./wav";

export type { SynthOpts, SynthResult, TtsBackend, VoiceOption } from "./types";

function localConfig(): LocalTtsConfig {
  return { url: env.localTtsUrl, apiKey: env.localTtsKey || undefined, sampleRate: env.localTtsSampleRate };
}

const ElevenLabsProvider: TtsProvider = {
  synthesizeParagraph: elevenlabs.synthesizeParagraph,
  listVoices: elevenlabs.listVoices,
};

/** VieNeu-TTS (or any OpenAI-compatible speech server) running on this machine. */
const LocalProvider: TtsProvider = {
  async synthesizeParagraph(opts) {
    const sentences = splitSentences(opts.text, opts.locale).map((s) => s.text);
    // Pronunciation substitutions apply per sentence; each sentence is its own request.
    const spoken = sentences.map((s) => buildSpokenText([s], opts.pronunciations).text);
    return synthesizeSentences(localConfig(), spoken, opts.voiceId);
  },
  listVoices: () => listLocalVoices(localConfig()),
};

/** Placeholder audio for dry run: a soft tone per sentence, the same for every provider. */
function drySynth(opts: SynthOpts): SynthResult {
  const sampleRate = sampleRateFromFormat(env.voiceFormat);
  const sentences = splitSentences(opts.text, opts.locale).map((s) => s.text);
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

export function ttsBackend(): TtsBackend {
  return env.ttsBackend;
}

/** The narration provider picked in Settings → Voice connection. */
export function ttsProvider(): TtsProvider {
  const p = env.ttsBackend === "local" ? LocalProvider : ElevenLabsProvider;
  return {
    synthesizeParagraph: async (opts) => (env.dryRun ? drySynth(opts) : p.synthesizeParagraph(opts)),
    listVoices: async (): Promise<VoiceOption[]> => {
      if (env.ttsBackend === "local" && env.dryRun) {
        return [{ id: "dry-run-voice", name: "Placeholder voice (DRY_RUN)", description: "Soft tones instead of speech", languages: [] }];
      }
      return p.listVoices();
    },
  };
}

export function pingLocal() {
  return pingLocalTts(localConfig());
}
