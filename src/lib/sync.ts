// Pure timing logic: script → sentences → aligned times → scene frames.
// Everything here is deterministic and unit-tested (sync.test.ts).

export type Range = { start: number; end: number }; // [start, end) char offsets
export type TimeSpan = { start: number; end: number }; // seconds

export function splitParagraphs(script: string): string[] {
  return script
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

const segmenters = new Map<string, Intl.Segmenter>();
function segmenter(locale: string, granularity: "sentence" | "word") {
  const key = `${locale}:${granularity}`;
  let s = segmenters.get(key);
  if (!s) segmenters.set(key, (s = new Intl.Segmenter(locale, { granularity })));
  return s;
}

/** Split a paragraph into sentences (language-aware), keeping char offsets into the paragraph. */
export function splitSentences(paragraph: string, locale = "en"): (Range & { text: string })[] {
  const out: (Range & { text: string })[] = [];
  for (const seg of segmenter(locale, "sentence").segment(paragraph)) {
    const raw = seg.segment;
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (!text) continue;
    const start = seg.index + lead;
    out.push({ start, end: start + text.length, text });
  }
  return out;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the text actually sent to TTS: each sentence with pronunciation
 * substitutions applied, joined by single spaces. Returns the char range of
 * every sentence *in the spoken text*, so alignment lookups stay exact.
 */
export function buildSpokenText(
  sentenceTexts: string[],
  pronunciations: Record<string, string> = {},
): { text: string; ranges: Range[] } {
  const entries = Object.entries(pronunciations).filter(([k, v]) => k.trim() && v.trim());
  const ranges: Range[] = [];
  let text = "";
  sentenceTexts.forEach((s, i) => {
    let spoken = s;
    for (const [word, say] of entries) {
      // Unicode-aware "whole word" match, so accented letters (e.g. Vietnamese) count as letters.
      spoken = spoken.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, "gu"), say);
    }
    if (i > 0) text += " ";
    ranges.push({ start: text.length, end: text.length + spoken.length });
    text += spoken;
  });
  return { text, ranges };
}

export type Alignment = {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
};

/**
 * Map sentence char ranges to times using ElevenLabs character alignment.
 * Uses the first/last non-whitespace char of each range. If the alignment
 * doesn't line up 1:1 with the text we sent (unexpected), falls back to a
 * proportional estimate so generation never hard-fails.
 */
export function sentenceTimesFromAlignment(
  spokenText: string,
  ranges: Range[],
  alignment: Alignment,
  audioDuration: number,
): TimeSpan[] {
  const chars = alignment.characters;
  const exact = chars.length === spokenText.length;
  if (!exact) {
    return ranges.map((r) => ({
      start: (r.start / spokenText.length) * audioDuration,
      end: (r.end / spokenText.length) * audioDuration,
    }));
  }
  return ranges.map((r) => {
    let a = r.start;
    let b = r.end - 1;
    while (a < b && /\s/.test(spokenText[a])) a++;
    while (b > a && /\s/.test(spokenText[b])) b--;
    return {
      start: alignment.characterStartTimesSeconds[a],
      end: alignment.characterEndTimesSeconds[b],
    };
  });
}

/** Global start offset (seconds) of every paragraph in the stitched track. */
export function paragraphOffsets(sampleCounts: number[], sampleRate: number, pauseMs: number): number[] {
  const pauseSamples = Math.round((pauseMs / 1000) * sampleRate);
  const offsets: number[] = [];
  let acc = 0;
  sampleCounts.forEach((n, i) => {
    offsets.push(acc / sampleRate);
    acc += n + (i < sampleCounts.length - 1 ? pauseSamples : 0);
  });
  return offsets;
}

export function totalSamples(sampleCounts: number[], sampleRate: number, pauseMs: number): number {
  const pauseSamples = Math.round((pauseMs / 1000) * sampleRate);
  return sampleCounts.reduce((a, b) => a + b, 0) + pauseSamples * Math.max(0, sampleCounts.length - 1);
}

export type SceneRef = { fromSentence: number; toSentence: number; nudgeMs?: number };
export type SceneTiming = TimeSpan & { fromFrame: number; durationInFrames: number };

/**
 * Scene k starts at its first sentence's start (minus the visual lead, plus
 * its nudge) and ends where scene k+1 starts, so images hold through pauses
 * and the whole track is covered with no gaps or overlaps.
 * Frames are derived from rounded *boundaries*, so rounding never accumulates.
 */
export function sceneTimeline(
  scenes: SceneRef[],
  sentenceStarts: number[],
  audioDuration: number,
  fps: number,
  visualLeadMs = 0,
): SceneTiming[] {
  if (!scenes.length) return [];
  const totalFrames = Math.max(1, Math.round(audioDuration * fps));
  const starts = scenes.map((s, k) => {
    if (k === 0) return 0;
    const t = (sentenceStarts[s.fromSentence] ?? 0) - visualLeadMs / 1000 + (s.nudgeMs ?? 0) / 1000;
    return Math.min(Math.max(t, 0), audioDuration);
  });
  // Frame boundaries: monotonic, each scene ≥ 1 frame where possible.
  const bounds: number[] = [];
  const n = scenes.length;
  starts.forEach((t, k) => {
    let f = Math.round(t * fps);
    if (k > 0) f = Math.max(f, bounds[k - 1] + 1);
    // Leave at least one frame for each remaining scene.
    f = Math.max(0, Math.min(f, totalFrames - (n - k)));
    bounds.push(f);
  });
  bounds.push(totalFrames);
  return scenes.map((_, k) => {
    const fromFrame = bounds[k];
    const durationInFrames = Math.max(1, bounds[k + 1] - fromFrame);
    return {
      fromFrame,
      durationInFrames,
      start: fromFrame / fps,
      end: (fromFrame + durationInFrames) / fps,
    };
  });
}

/** Verify scenes cover [0, n) sentences contiguously. Returns problems, empty if ok. */
export function checkSceneCoverage(scenes: SceneRef[], sentenceCount: number): string[] {
  const problems: string[] = [];
  let expected = 0;
  scenes.forEach((s, k) => {
    if (s.fromSentence !== expected) problems.push(`Scene ${k + 1} starts at sentence ${s.fromSentence + 1}, expected ${expected + 1}`);
    if (s.toSentence < s.fromSentence) problems.push(`Scene ${k + 1} has an empty sentence range`);
    expected = s.toSentence + 1;
  });
  if (expected !== sentenceCount) problems.push(`Scenes end at sentence ${expected}, script has ${sentenceCount}`);
  return problems;
}

/** Repair a model-produced plan into a contiguous cover of [0, n). */
export function normalizeSceneRanges<T extends SceneRef>(scenes: T[], sentenceCount: number): T[] {
  const sorted = [...scenes].sort((a, b) => a.fromSentence - b.fromSentence);
  const out: T[] = [];
  let next = 0;
  for (const s of sorted) {
    if (next >= sentenceCount) break;
    const to = Math.min(Math.max(s.toSentence, next), sentenceCount - 1);
    out.push({ ...s, fromSentence: next, toSentence: to });
    next = to + 1;
  }
  if (next < sentenceCount && out.length) out[out.length - 1] = { ...out[out.length - 1], toSentence: sentenceCount - 1 };
  return out;
}

export function toSrtTime(t: number): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

export function buildSrt(items: { text: string; start: number; end: number }[]): string {
  return items
    .map((it, i) => `${i + 1}\n${toSrtTime(it.start)} --> ${toSrtTime(it.end)}\n${it.text}\n`)
    .join("\n");
}

export function estimateMinutes(words: number, wpm = 170) {
  return words / wpm;
}

/** Words in any language (Chinese/Japanese/Thai have no spaces, so use the word segmenter). */
export function wordCount(text: string, locale = "en") {
  if (!text.trim()) return 0;
  let n = 0;
  for (const s of segmenter(locale, "word").segment(text)) if (s.isWordLike) n++;
  return n;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

// ---------- Shorts: vertical clips cut from the long narration ----------

export type ClipRange = { fromSentence: number; toSentence: number };

/**
 * Grow/shrink a sentence range so the clip lasts between `min` and `max` seconds,
 * always on sentence boundaries. Returns the adjusted range.
 */
export function clampClip(clip: ClipRange, starts: number[], ends: number[], min = 20, max = 60): ClipRange {
  const n = starts.length;
  const from = Math.max(0, Math.min(clip.fromSentence, n - 1));
  let to = Math.max(from, Math.min(clip.toSentence, n - 1));
  const dur = () => ends[to] - starts[from];
  while (dur() > max && to > from) to--;
  while (dur() < min && to < n - 1 && ends[to + 1] - starts[from] <= max) to++;
  return { fromSentence: from, toSentence: to };
}

/** Clip window in the long audio: from the first word to just after the last one (never into the next sentence). */
export function clipWindow(clip: ClipRange, starts: number[], ends: number[], audioDuration: number, tail = 0.4) {
  const start = starts[clip.fromSentence];
  const next = starts[clip.toSentence + 1] ?? audioDuration;
  const end = Math.min(ends[clip.toSentence] + tail, next, audioDuration);
  return { start, end, duration: Math.max(0.1, end - start) };
}

/** Longest a YouTube Short may be. */
export const SHORT_MAX_SECONDS = 180;

export type SeriesSentence = { start: number; end: number; paragraphIdx: number; text: string };

/**
 * Cut the narration into consecutive parts of about `partSeconds` (in narration time), covering it in order.
 * Each cut lands on a sentence boundary between 75% and 125% of the target, preferring a paragraph end,
 * then a question (a natural cliffhanger), then whatever is nearest the target. A short leftover joins the last part.
 */
export function seriesSplit(sentences: SeriesSentence[], opts: { partSeconds: number; maxParts?: number | null; maxSeconds?: number }): ClipRange[] {
  const n = sentences.length;
  const target = Math.max(5, opts.partSeconds);
  const max = opts.maxSeconds ?? SHORT_MAX_SECONDS;
  const lo = target * 0.75;
  const hi = Math.min(target * 1.25, max);
  const paragraphEnd = (i: number) => i === n - 1 || sentences[i + 1].paragraphIdx !== sentences[i].paragraphIdx;
  const parts: ClipRange[] = [];
  let from = 0;
  while (from < n && (!opts.maxParts || parts.length < opts.maxParts)) {
    let best = from;
    let bestScore = Infinity;
    for (let to = from; to < n; to++) {
      const d = sentences[to].end - sentences[from].start;
      if (d > hi && to > from) break;
      if (d < lo && to < n - 1) continue;
      const score = Math.abs(d - target) / target - (paragraphEnd(to) ? 0.3 : 0) - (/[?？]\s*$/.test(sentences[to].text) ? 0.15 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = to;
      }
    }
    // Nothing in range (e.g. the next sentence alone is long): take the longest piece that still fits.
    if (bestScore === Infinity) {
      while (best + 1 < n && sentences[best + 1].end - sentences[from].start <= hi) best++;
    }
    parts.push({ fromSentence: from, toSentence: best });
    from = best + 1;
  }
  const dur = (c: ClipRange) => sentences[c.toSentence].end - sentences[c.fromSentence].start;
  if (!opts.maxParts && parts.length > 1) {
    const last = parts[parts.length - 1];
    const prev = parts[parts.length - 2];
    const merged = { fromSentence: prev.fromSentence, toSentence: last.toSentence };
    if (dur(last) < target * 0.4 && dur(merged) <= max) parts.splice(-2, 2, merged);
  }
  return parts;
}

/**
 * A clip played at `rate` (1.2 = 20% faster, voice pitch kept): all times in output seconds, plus the
 * audio trim in source frames. Remotion's trimBefore counts source frames; trimAfter counts frames of the
 * trim sequence, so the audio ends `durationInFrames` output frames after it starts.
 */
export function clipAtSpeed(clip: ClipRange, starts: number[], ends: number[], audioDuration: number, rate: number, fps: number) {
  const r = rate > 0 ? rate : 1;
  const source = clipWindow(clip, starts, ends, audioDuration);
  const s = starts.map((t) => t / r);
  const e = ends.map((t) => t / r);
  const win = clipWindow(clip, s, e, audioDuration / r);
  const durationInFrames = Math.max(1, Math.round(win.duration * fps));
  const trimBefore = Math.round(source.start * fps);
  return { starts: s, ends: e, win, durationInFrames, trimBefore, trimAfter: trimBefore + durationInFrames };
}

/**
 * Timeline of the scenes that overlap a clip, relative to the clip start (frame 0).
 * Reuses sceneTimeline so cuts follow exactly the same sync rules as the long video.
 */
export function clipSceneTimeline<T extends SceneRef>(
  scenes: T[],
  clip: ClipRange,
  starts: number[],
  window: { start: number; duration: number },
  fps: number,
  visualLeadMs = 0,
): { scene: T; timing: SceneTiming }[] {
  const inClip = scenes.filter((s) => s.toSentence >= clip.fromSentence && s.fromSentence <= clip.toSentence);
  // A scene that began before the clip starts at the clip's first sentence.
  const refs = inClip.map((s) => ({ ...s, fromSentence: Math.max(s.fromSentence, clip.fromSentence) }));
  const rel = starts.map((t) => t - window.start);
  const timing = sceneTimeline(refs, rel, window.duration, fps, visualLeadMs);
  return inClip.map((scene, i) => ({ scene, timing: timing[i] }));
}

/** Split a sentence into short caption chunks (~`words` words), timed proportionally to their length. */
export function captionChunks(text: string, start: number, end: number, words = 3, locale = "en") {
  // Group by word-like segments (works without spaces), keeping the original spacing/punctuation.
  const groups: string[] = [];
  let cur = "";
  let count = 0;
  for (const s of segmenter(locale, "word").segment(text.trim())) {
    if (s.isWordLike && count === words) {
      groups.push(cur.trim());
      cur = "";
      count = 0;
    }
    cur += s.segment;
    if (s.isWordLike) count++;
  }
  if (cur.trim()) groups.push(cur.trim());
  const total = groups.reduce((a, g) => a + g.length, 0) || 1;
  let t = start;
  return groups.map((g) => {
    const d = ((end - start) * g.length) / total;
    const chunk = { text: g, start: t, end: t + d };
    t += d;
    return chunk;
  });
}

/** A polished script is only accepted if it keeps the same paragraphs (they map 1:1 to voice clips). */
export function acceptPolish(original: string, polished: string) {
  const a = splitParagraphs(original);
  const b = splitParagraphs(polished);
  return b.length === a.length && b.every((p) => p.trim().length > 0);
}

// ---------- Camera cuts: several shots of one image ----------

export type Framing = "wide" | "left" | "right" | "center";
const FRAMING_CYCLE: Framing[] = ["left", "right", "center"];

/**
 * Split one scene into shots that start at each of its sentences (minus the visual lead),
 * so the picture changes with every sentence even when the image is reused.
 * Returns frames relative to the scene start. The first shot is always the wide framing.
 */
export function shotTimeline(
  scene: SceneRef,
  timing: { fromFrame: number; durationInFrames: number },
  sentenceStarts: number[], // seconds, same timeline as `timing`
  fps: number,
  visualLeadMs = 0,
  minShotFrames = 12,
): { fromFrame: number; framing: Framing }[] {
  const shots: { fromFrame: number; framing: Framing }[] = [{ fromFrame: 0, framing: "wide" }];
  for (let i = scene.fromSentence + 1; i <= scene.toSentence; i++) {
    const t = sentenceStarts[i];
    if (t == null) continue;
    const f = Math.round((t - visualLeadMs / 1000) * fps) - timing.fromFrame;
    const last = shots[shots.length - 1].fromFrame;
    // Skip cuts that would make a shot too short (at either end of the scene).
    if (f - last < minShotFrames || timing.durationInFrames - f < minShotFrames) continue;
    shots.push({ fromFrame: f, framing: FRAMING_CYCLE[(shots.length - 1) % FRAMING_CYCLE.length] });
  }
  return shots;
}

/** Sentences longer than `max` words (language-aware), with their paragraph index. */
export function longSentences(script: string, locale: string, max: number) {
  const out: { paragraph: number; text: string; words: number }[] = [];
  splitParagraphs(script).forEach((p, i) => {
    for (const s of splitSentences(p, locale)) {
      const words = wordCount(s.text, locale);
      if (words > max) out.push({ paragraph: i, text: s.text, words });
    }
  });
  return out;
}

/**
 * Pacing stats of a pasted transcript. Timestamps like "0:02", "1:05:10" or "[00:13]" are
 * stripped; if present, words per minute is measured against the last timestamp.
 */
export function transcriptStats(raw: string, locale = "en") {
  const stamp = /\[?\b(\d{1,2}:)?\d{1,2}:\d{2}\b\]?/g;
  let lastSec = 0;
  for (const m of raw.matchAll(stamp)) {
    const parts = m[0].replace(/[[\]]/g, "").split(":").map(Number);
    const sec = parts.reduce((a, n) => a * 60 + n, 0);
    if (sec > lastSec) lastSec = sec;
  }
  const text = raw.replace(stamp, " ").replace(/\s+/g, " ").trim();
  const sentences = splitSentences(text, locale).filter((s) => wordCount(s.text, locale) > 0);
  const words = wordCount(text, locale);
  return {
    text,
    words,
    sentences: sentences.length,
    avgWordsPerSentence: sentences.length ? Math.round((words / sentences.length) * 10) / 10 : 0,
    wordsPerMinute: lastSec > 60 ? Math.round(words / (lastSec / 60)) : null,
  };
}
