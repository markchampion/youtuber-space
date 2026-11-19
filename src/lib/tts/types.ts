import type { VoiceSettings } from "@/lib/channel";
import type { TimeSpan } from "@/lib/sync";

export type SynthOpts = {
  text: string;
  voiceId: string;
  settings: VoiceSettings;
  pronunciations: Record<string, string>;
  previousText?: string;
  nextText?: string;
  projectId: string;
  locale?: string; // must match the locale used when the script was split into sentences
};

export type SynthResult = {
  pcm: Buffer; // 16-bit mono
  sampleRate: number;
  sampleCount: number;
  sentenceTimes: TimeSpan[]; // relative to paragraph start
};

export type VoiceOption = {
  id: string;
  name: string;
  description?: string;
  previewUrl?: string;
  labels?: Record<string, string>;
  languages: string[]; // ISO codes the voice is verified for (e.g. "vi")
  featured?: boolean;
};

export type TtsBackend = "elevenlabs" | "local";

export interface TtsProvider {
  synthesizeParagraph(opts: SynthOpts): Promise<SynthResult>;
  listVoices(): Promise<VoiceOption[]>;
}
