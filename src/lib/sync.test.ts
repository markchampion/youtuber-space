import { describe, expect, it } from "vitest";
import {
  buildSpokenText,
  clipAtSpeed,
  seriesSplit,
  checkSceneCoverage,
  normalizeSceneRanges,
  paragraphOffsets,
  sceneTimeline,
  sentenceTimesFromAlignment,
  splitParagraphs,
  splitSentences,
  toSrtTime,
  shotTimeline,
  totalSamples,
} from "./sync";

function fakeAlignment(text: string, secPerChar = 0.05) {
  const chars = [...text];
  return {
    characters: chars,
    characterStartTimesSeconds: chars.map((_, i) => i * secPerChar),
    characterEndTimesSeconds: chars.map((_, i) => (i + 1) * secPerChar),
  };
}

describe("script splitting", () => {
  it("splits paragraphs on blank lines and joins wrapped lines", () => {
    expect(splitParagraphs("One.\nStill one.\n\n\nTwo.")).toEqual(["One. Still one.", "Two."]);
  });

  it("splits sentences with offsets into the paragraph", () => {
    const p = "You wake up. No alarm, no schedule. For 300,000 years?";
    const s = splitSentences(p);
    expect(s.map((x) => x.text)).toEqual(["You wake up.", "No alarm, no schedule.", "For 300,000 years?"]);
    for (const x of s) expect(p.slice(x.start, x.end)).toBe(x.text);
  });
});

describe("alignment → sentence times", () => {
  it("maps ranges exactly using character offsets, including pronunciation swaps", () => {
    const { text, ranges } = buildSpokenText(["Polly Wiessner studied fire.", "Then night."], {
      Wiessner: "Veesner",
    });
    expect(text).toBe("Polly Veesner studied fire. Then night.");
    const times = sentenceTimesFromAlignment(text, ranges, fakeAlignment(text), 10);
    expect(times[0].start).toBeCloseTo(0);
    expect(times[0].end).toBeCloseTo(ranges[0].end * 0.05);
    expect(times[1].start).toBeCloseTo(ranges[1].start * 0.05);
  });

  it("falls back to proportional timing if alignment length mismatches", () => {
    const text = "Ab. Cd.";
    const times = sentenceTimesFromAlignment(text, [{ start: 0, end: 3 }, { start: 4, end: 7 }], fakeAlignment("x"), 7);
    expect(times[1].end).toBeCloseTo(7);
  });
});

describe("paragraph stitching", () => {
  it("offsets are exact sample sums plus pauses, and total matches the WAV length", () => {
    const rate = 24000;
    const counts = [24000 * 3, 24001, 12345];
    const offsets = paragraphOffsets(counts, rate, 350);
    const pause = Math.round(0.35 * rate);
    expect(offsets).toEqual([0, (counts[0] + pause) / rate, (counts[0] + counts[1] + 2 * pause) / rate]);
    expect(totalSamples(counts, rate, 350)).toBe(counts[0] + counts[1] + counts[2] + 2 * pause);
  });
});

describe("scene timeline", () => {
  const fps = 30;

  it("covers the full duration with no gaps or overlaps", () => {
    const starts = [0, 1.013, 2.52, 4.7, 6.66, 9.1];
    const scenes = [
      { fromSentence: 0, toSentence: 1 },
      { fromSentence: 2, toSentence: 2 },
      { fromSentence: 3, toSentence: 4 },
      { fromSentence: 5, toSentence: 5 },
    ];
    const t = sceneTimeline(scenes, starts, 12.345, fps, 150);
    expect(t[0].fromFrame).toBe(0);
    for (let k = 1; k < t.length; k++) expect(t[k].fromFrame).toBe(t[k - 1].fromFrame + t[k - 1].durationInFrames);
    const last = t[t.length - 1];
    expect(last.fromFrame + last.durationInFrames).toBe(Math.round(12.345 * fps));
  });

  it("applies visual lead and nudge, and never drifts over many scenes", () => {
    const starts = Array.from({ length: 500 }, (_, i) => i * 1.0333);
    const scenes = starts.map((_, i) => ({ fromSentence: i, toSentence: i }));
    const t = sceneTimeline(scenes, starts, 600, fps, 150);
    // Every boundary is within half a frame of its target time.
    for (let k = 1; k < t.length; k++) {
      expect(Math.abs(t[k].fromFrame / fps - (starts[k] - 0.15))).toBeLessThanOrEqual(0.5 / fps + 1e-9);
    }
    const nudged = sceneTimeline([{ fromSentence: 0, toSentence: 0 }, { fromSentence: 1, toSentence: 1, nudgeMs: 500 }], [0, 2], 5, fps, 0);
    expect(nudged[1].fromFrame).toBe(75);
  });

  it("keeps at least one frame per scene when starts collide", () => {
    const t = sceneTimeline(
      [{ fromSentence: 0, toSentence: 0 }, { fromSentence: 1, toSentence: 1 }, { fromSentence: 2, toSentence: 2 }],
      [0, 0.001, 0.002],
      1,
      fps,
    );
    expect(t.every((s) => s.durationInFrames >= 1)).toBe(true);
  });
});

describe("scene coverage", () => {
  it("detects gaps and repairs plans", () => {
    const bad = [
      { fromSentence: 0, toSentence: 1 },
      { fromSentence: 3, toSentence: 3 },
    ];
    expect(checkSceneCoverage(bad, 5).length).toBeGreaterThan(0);
    const fixed = normalizeSceneRanges(bad, 5);
    expect(checkSceneCoverage(fixed, 5)).toEqual([]);
  });
});

it("formats SRT times", () => {
  expect(toSrtTime(3723.4567)).toBe("01:02:03,457");
});

describe("shotTimeline (camera cuts)", () => {
  const fps = 30;
  it("cuts at each later sentence start, first shot wide, framings cycle", () => {
    const starts = [0, 2, 4, 6];
    const shots = shotTimeline({ fromSentence: 0, toSentence: 3 }, { fromFrame: 0, durationInFrames: 240 }, starts, fps);
    expect(shots).toEqual([
      { fromFrame: 0, framing: "wide" },
      { fromFrame: 60, framing: "left" },
      { fromFrame: 120, framing: "right" },
      { fromFrame: 180, framing: "center" },
    ]);
  });
  it("is relative to the scene start and applies the visual lead", () => {
    const shots = shotTimeline({ fromSentence: 5, toSentence: 6 }, { fromFrame: 300, durationInFrames: 150 }, [0, 0, 0, 0, 0, 10, 12], fps, 100);
    expect(shots[1]).toEqual({ fromFrame: 57, framing: "left" }); // 12s - 0.1s = 357 frames, minus 300
  });
  it("drops cuts that would leave a shot shorter than the minimum", () => {
    const shots = shotTimeline({ fromSentence: 0, toSentence: 2 }, { fromFrame: 0, durationInFrames: 100 }, [0, 0.2, 3.1], fps);
    expect(shots.map((s) => s.fromFrame)).toEqual([0]); // 6 frames in, and 7 frames before the end: both too short
  });
  it("a one-sentence scene is a single wide shot", () => {
    expect(shotTimeline({ fromSentence: 2, toSentence: 2 }, { fromFrame: 0, durationInFrames: 90 }, [0, 1, 2], fps)).toHaveLength(1);
  });
});

describe("seriesSplit", () => {
  // 40 sentences of 5 s each, 4 sentences per paragraph: 200 s of narration.
  const sents = Array.from({ length: 40 }, (_, i) => ({ start: i * 5, end: i * 5 + 4.6, paragraphIdx: Math.floor(i / 4), text: i === 10 ? "Why?" : "A sentence." }));

  it("covers every sentence in order, with no gaps or overlaps, within the limits", () => {
    const parts = seriesSplit(sents, { partSeconds: 60 });
    expect(parts[0].fromSentence).toBe(0);
    expect(parts[parts.length - 1].toSentence).toBe(39);
    for (let i = 1; i < parts.length; i++) expect(parts[i].fromSentence).toBe(parts[i - 1].toSentence + 1);
    for (const p of parts.slice(0, -1)) {
      const d = sents[p.toSentence].end - sents[p.fromSentence].start;
      expect(d).toBeGreaterThanOrEqual(45);
      expect(d).toBeLessThanOrEqual(75);
    }
  });

  it("prefers cutting at paragraph ends", () => {
    const parts = seriesSplit(sents, { partSeconds: 60 });
    for (const p of parts) expect(p.toSentence % 4).toBe(3);
  });

  it("merges a short leftover into the last part, and respects maxParts", () => {
    const parts = seriesSplit(sents.slice(0, 26), { partSeconds: 60 }); // 130 s: 60 + 60 + 10 → merged
    expect(parts.length).toBe(2);
    expect(parts[1].toSentence).toBe(25);
    const three = seriesSplit(sents, { partSeconds: 30, maxParts: 3 });
    expect(three.length).toBe(3);
    expect(three[0].fromSentence).toBe(0);
  });
});

describe("clipAtSpeed", () => {
  const starts = [0, 10, 20, 30];
  const ends = [9, 19, 29, 39];
  it("scales the clip to the speed but trims the audio in source frames", () => {
    const one = clipAtSpeed({ fromSentence: 1, toSentence: 2 }, starts, ends, 40, 1, 30);
    const fast = clipAtSpeed({ fromSentence: 1, toSentence: 2 }, starts, ends, 40, 1.2, 30);
    // The 0.4 s tail after the last word stays 0.4 s on screen, so allow a few frames.
    expect(Math.abs(fast.durationInFrames - one.durationInFrames / 1.2)).toBeLessThan(4);
    expect(fast.trimBefore).toBe(300);
    expect(fast.trimAfter).toBe(300 + fast.durationInFrames);
    expect(fast.starts[2]).toBeCloseTo(20 / 1.2);
  });
});
