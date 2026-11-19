import { describe, expect, it } from "vitest";
import { SENTENCE_GAP_MS, listLocalVoices, synthesizeSentences, trimSilence, type LocalTtsConfig } from "./local-core";

const RATE = 24000;

/** `ms` of a loud tone wrapped in `padMs` of silence on both sides. */
function clip(ms: number, padMs = 100): Buffer {
  const pad = Math.round((padMs / 1000) * RATE);
  const tone = Math.round((ms / 1000) * RATE);
  const b = Buffer.alloc((pad * 2 + tone) * 2);
  for (let i = 0; i < tone; i++) b.writeInt16LE(i % 2 ? 8000 : -8000, (pad + i) * 2);
  return b;
}

function fakeServer(lengths: Record<string, number>, opts: { busyFirst?: boolean } = {}) {
  const calls: { url: string; body: Record<string, unknown> | null; auth: string | null }[] = [];
  let busy = Boolean(opts.busyFirst);
  const f = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const h = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, body, auth: h.authorization ?? null });
    if (busy) {
      busy = false;
      return new Response("{}", { status: 429, headers: { "retry-after": "1" } });
    }
    if (url.endsWith("/voices")) {
      return Response.json({ data: [{ id: "Mai Anh", name: "Mai Anh", gender: "female" }, { id: "Trúc Ly", name: "Trúc Ly", description: "Nữ · Bắc", featured: 2 }, { id: "Adam", name: "Adam", featured: 1 }] });
    }
    return new Response(new Uint8Array(clip(lengths[body.input] ?? 500)));
  }) as unknown as typeof fetch;
  const slept: number[] = [];
  const cfg: LocalTtsConfig = { url: "http://tts/v1", apiKey: "k", sampleRate: RATE, fetch: f, sleep: async (ms) => void slept.push(ms) };
  return { cfg, calls, slept };
}

describe("local TTS (VieNeu)", () => {
  it("trims silence at clip edges but keeps a short pad", () => {
    const out = trimSilence(clip(1000, 400), RATE);
    const pad = Math.round(0.03 * RATE);
    expect(out.length / 2).toBe(RATE + pad * 2);
    expect(trimSilence(Buffer.alloc(2000), RATE).length).toBe(0);
  });

  it("speaks one request per sentence and derives exact sentence times from sample counts", async () => {
    const { cfg, calls } = fakeServer({ "Xin chào.": 1000, "Tạm biệt.": 500 });
    const r = await synthesizeSentences(cfg, ["Xin chào.", "Tạm biệt."], "Mai Anh");

    expect(calls.map((c) => c.body?.input)).toEqual(["Xin chào.", "Tạm biệt."]);
    expect(calls[0].body).toMatchObject({ voice: "Mai Anh", response_format: "pcm", sample_rate: RATE });
    expect(calls[0].auth).toBe("Bearer k");

    const pad = 0.03;
    const gap = SENTENCE_GAP_MS / 1000;
    expect(r.sentenceTimes[0].start).toBe(0);
    expect(r.sentenceTimes[0].end).toBeCloseTo(1 + 2 * pad, 6);
    expect(r.sentenceTimes[1].start).toBeCloseTo(r.sentenceTimes[0].end + gap, 6);
    expect(r.sentenceTimes[1].end).toBeCloseTo(r.sentenceTimes[1].start + 0.5 + 2 * pad, 6);
    expect(r.sampleCount).toBe(r.pcm.length / 2);
    expect(r.sampleCount / RATE).toBeCloseTo(r.sentenceTimes[1].end, 6);
  });

  it("waits and retries when the server is busy (429)", async () => {
    const { cfg, calls, slept } = fakeServer({}, { busyFirst: true });
    await synthesizeSentences(cfg, ["Một."], "Mai Anh");
    expect(calls).toHaveLength(2);
    expect(slept).toEqual([1000]);
  });

  it("explains how to start the server when it isn't running", async () => {
    const cfg: LocalTtsConfig = {
      url: "http://127.0.0.1:1/v1",
      sampleRate: RATE,
      fetch: (async () => {
        throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
      }) as unknown as typeof fetch,
    };
    await expect(synthesizeSentences(cfg, ["Một."], "x")).rejects.toThrow(/isn't reachable.*ECONNREFUSED.*apps\.openai_speech/);
  });

  it("lists voices with featured ones first", async () => {
    const { cfg } = fakeServer({});
    const v = await listLocalVoices(cfg);
    expect(v.map((x) => x.id)).toEqual(["Adam", "Trúc Ly", "Mai Anh"]);
    expect(v[1]).toMatchObject({ description: "Nữ · Bắc", featured: true, languages: ["vi", "en"] });
    expect(v[2]).toMatchObject({ description: "female", featured: false });
  });
});
