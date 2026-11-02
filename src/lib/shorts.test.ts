import { describe, expect, it } from "vitest";
import { captionChunks, clampClip, clipSceneTimeline, clipWindow } from "./sync";

// 20 sentences, each 4 s long with a 0.5 s gap.
const starts = Array.from({ length: 20 }, (_, i) => i * 4.5);
const ends = starts.map((s) => s + 4);
const audio = ends[19] + 0.3;

describe("clampClip", () => {
  it("extends a too-short clip to at least 20 s on sentence boundaries", () => {
    const c = clampClip({ fromSentence: 2, toSentence: 3 }, starts, ends);
    expect(ends[c.toSentence] - starts[c.fromSentence]).toBeGreaterThanOrEqual(20);
    expect(c.fromSentence).toBe(2);
  });
  it("trims a too-long clip to at most 60 s", () => {
    const c = clampClip({ fromSentence: 0, toSentence: 19 }, starts, ends);
    expect(ends[c.toSentence] - starts[c.fromSentence]).toBeLessThanOrEqual(60);
  });
  it("stays in range at the end of the script", () => {
    const c = clampClip({ fromSentence: 18, toSentence: 25 }, starts, ends);
    expect(c.toSentence).toBe(19);
  });
});

describe("clip timeline", () => {
  const scenes = [
    { fromSentence: 0, toSentence: 3 },
    { fromSentence: 4, toSentence: 6 },
    { fromSentence: 7, toSentence: 9 },
    { fromSentence: 10, toSentence: 19 },
  ];
  const clip = { fromSentence: 5, toSentence: 11 };
  const win = clipWindow(clip, starts, ends, audio);

  it("window starts on the first word and never runs into the next sentence", () => {
    expect(win.start).toBe(starts[5]);
    expect(win.start + win.duration).toBeLessThanOrEqual(starts[12]);
  });

  it("starts at frame 0 and covers the clip with no gaps", () => {
    const fps = 30;
    const t = clipSceneTimeline(scenes, clip, starts, win, fps, 150);
    expect(t.map((x) => x.scene.fromSentence)).toEqual([4, 7, 10]); // scenes overlapping sentences 5..11
    expect(t[0].timing.fromFrame).toBe(0);
    for (let i = 1; i < t.length; i++) {
      expect(t[i].timing.fromFrame).toBe(t[i - 1].timing.fromFrame + t[i - 1].timing.durationInFrames);
    }
    const last = t[t.length - 1].timing;
    expect(last.fromFrame + last.durationInFrames).toBe(Math.round(win.duration * fps));
    // Scene at sentence 7 cuts 150 ms before sentence 7 starts, relative to the clip.
    expect(Math.abs(t[1].timing.fromFrame / fps - (starts[7] - win.start - 0.15))).toBeLessThanOrEqual(0.5 / fps + 1e-9);
  });
});

it("splits captions into timed chunks that span the sentence", () => {
  const c = captionChunks("You wake up when your body is ready.", 10, 13);
  expect(c.map((x) => x.text)).toEqual(["You wake up", "when your body", "is ready."]);
  expect(c[0].start).toBe(10);
  expect(c[c.length - 1].end).toBeCloseTo(13);
});
