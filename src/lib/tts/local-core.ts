// Local TTS over an OpenAI-compatible speech server (VieNeu-TTS `apps/openai_speech.py`).
// No server-only imports, so it can be unit tested with a fake fetch.
//
// The server returns audio but no timestamps. Each sentence is therefore spoken in its own request and the
// clips are joined with a fixed gap: sentence boundaries come from exact sample counts, so voice/image sync
// stays as exact as with ElevenLabs' character alignment.

import type { TimeSpan } from "@/lib/sync";
import type { SynthResult, VoiceOption } from "./types";

export type LocalTtsConfig = {
  url: string; // e.g. http://127.0.0.1:8000/v1 (no trailing slash)
  apiKey?: string;
  sampleRate: number;
  fetch?: typeof fetch;
  /** Wait between retries when the server is busy (429). Overridable for tests. */
  sleep?: (ms: number) => Promise<void>;
};

/** Silence between sentences of one paragraph. */
export const SENTENCE_GAP_MS = 250;
/** Silence kept before and after each trimmed sentence clip. */
const EDGE_PAD_MS = 30;
/** Samples quieter than this (≈ -40 dBFS) count as silence when trimming clip edges. */
const SILENCE_LEVEL = 330;
const MAX_RETRIES = 6;
const REQUEST_TIMEOUT_MS = 180_000;

export const START_HINT = "Start it with `uv run python -m apps.openai_speech` in the VieNeu-TTS folder";

function headers(cfg: LocalTtsConfig, json = false): Record<string, string> {
  return {
    ...(json ? { "content-type": "application/json" } : {}),
    ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
  };
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** fetch with readable errors for the usual local-server problems. */
async function call(cfg: LocalTtsConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const f = cfg.fetch ?? fetch;
  const sleep = cfg.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await f(`${cfg.url}${path}`, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (e) {
      const cause = (e as { cause?: { code?: string } }).cause?.code;
      if ((e as Error).name === "TimeoutError") throw new Error(`Local TTS at ${cfg.url} took longer than ${REQUEST_TIMEOUT_MS / 1000}s to answer.`);
      throw new Error(`Local TTS isn't reachable at ${cfg.url}${cause ? ` (${cause})` : ""}. ${START_HINT}, or fix the server address in Settings.`);
    }
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const wait = Number(res.headers.get("retry-after"));
      await sleep((Number.isFinite(wait) && wait > 0 ? wait : 2) * 1000);
      continue;
    }
    if (res.ok) return res;
    const body = await res.text().catch(() => "");
    let detail = body;
    try {
      const j = JSON.parse(body);
      detail = j?.error?.message ?? j?.detail ?? body;
    } catch {
      // not JSON
    }
    if (res.status === 401) throw new Error("Local TTS rejected the key (401). Set the same key as the server's VIENEU_API_KEY in Settings.");
    throw new Error(`Local TTS: ${String(detail || res.statusText).slice(0, 300)} (${res.status})`);
  }
}

/** Speak one piece of text; returns 16-bit mono PCM at cfg.sampleRate. */
export async function speak(cfg: LocalTtsConfig, input: string, voice: string): Promise<Buffer> {
  const res = await call(cfg, "/audio/speech", {
    method: "POST",
    headers: headers(cfg, true),
    body: JSON.stringify({ input, voice, response_format: "pcm", sample_rate: cfg.sampleRate }),
  });
  const pcm = Buffer.from(await res.arrayBuffer());
  return pcm.subarray(0, pcm.length - (pcm.length % 2));
}

/** Cut near-silence from both ends, keeping a short pad, so gaps between sentences are the same everywhere. */
export function trimSilence(pcm: Buffer, sampleRate: number): Buffer {
  const n = Math.floor(pcm.length / 2);
  let a = 0;
  while (a < n && Math.abs(pcm.readInt16LE(a * 2)) < SILENCE_LEVEL) a++;
  if (a >= n) return pcm.subarray(0, 0);
  let b = n - 1;
  while (b > a && Math.abs(pcm.readInt16LE(b * 2)) < SILENCE_LEVEL) b--;
  const pad = Math.round((EDGE_PAD_MS / 1000) * sampleRate);
  return pcm.subarray(Math.max(0, a - pad) * 2, Math.min(n, b + 1 + pad) * 2);
}

/** Speak each sentence separately and join them; sentence times are exact sample offsets. */
export async function synthesizeSentences(cfg: LocalTtsConfig, sentences: string[], voice: string): Promise<SynthResult> {
  const gap = Math.round((SENTENCE_GAP_MS / 1000) * cfg.sampleRate);
  const parts: Buffer[] = [];
  const sentenceTimes: TimeSpan[] = [];
  let at = 0; // samples
  for (const [i, text] of sentences.entries()) {
    const clip = text.trim() ? trimSilence(await speak(cfg, text, voice), cfg.sampleRate) : Buffer.alloc(0);
    if (i > 0) {
      parts.push(Buffer.alloc(gap * 2));
      at += gap;
    }
    const len = clip.length / 2;
    sentenceTimes.push({ start: at / cfg.sampleRate, end: (at + len) / cfg.sampleRate });
    parts.push(clip);
    at += len;
  }
  const pcm = Buffer.concat(parts);
  return { pcm, sampleRate: cfg.sampleRate, sampleCount: pcm.length / 2, sentenceTimes };
}

// VieNeu: `featured` is a rank (1 = first editor's pick), null/absent for the rest; `description` already
// says gender, accent and style ("Nữ · Bắc · Phong cách tin tức").
type ServerVoice = { id: string; name?: string; description?: string; gender?: string; featured?: number | boolean | null };

function rank(v: ServerVoice) {
  if (typeof v.featured === "number" && v.featured > 0) return v.featured;
  return v.featured === true ? 1000 : Infinity;
}

export async function listLocalVoices(cfg: LocalTtsConfig): Promise<VoiceOption[]> {
  const res = await call(cfg, "/voices", { headers: headers(cfg) });
  const body = (await res.json()) as { data?: ServerVoice[] };
  return [...(body.data ?? [])]
    .sort((a, b) => rank(a) - rank(b) || (a.name || a.id).localeCompare(b.name || b.id))
    .map((v) => ({
      id: v.id,
      name: v.name || v.id,
      description: v.description || v.gender || undefined,
      languages: ["vi", "en"], // VieNeu v3 is bilingual
      featured: rank(v) !== Infinity,
    }));
}

/** Read-only check for the Settings Test button. */
export async function pingLocalTts(cfg: LocalTtsConfig): Promise<string> {
  const models = (await (await call(cfg, "/models", { headers: headers(cfg) })).json()) as {
    data?: { id: string; backend?: string }[];
  };
  const voices = await listLocalVoices(cfg);
  const m = models.data?.[0];
  return `Connected. ${m ? `${m.id}${m.backend ? ` (${m.backend})` : ""}, ` : ""}${voices.length} voices available.`;
}
