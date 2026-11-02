import { describe, expect, it } from "vitest";
import { SILENT_PACE, silentTimings } from "./silent-timing";
import { stepsFor } from "./types";

describe("silent timing", () => {
  it("clamps each line between the min and max reading time, back to back", () => {
    const t = silentTimings([1, 6, 40]);
    expect(t[0]).toEqual({ start: 0, end: SILENT_PACE.minSeconds });
    expect(t[1].start).toBe(t[0].end);
    expect(t[1].end - t[1].start).toBeCloseTo(6 / SILENT_PACE.wordsPerSecond);
    expect(t[2].end - t[2].start).toBeCloseTo(SILENT_PACE.maxSeconds);
  });

  it("totals the sum of the line durations", () => {
    const t = silentTimings([7, 7, 7, 7, 7]);
    expect(t.at(-1)!.end).toBeCloseTo(5 * (7 / SILENT_PACE.wordsPerSecond));
  });
});

describe("stepsFor", () => {
  it("drops the voice step only for silent product ads", () => {
    expect(stepsFor("product_ad", "none").map((s) => s.key)).toEqual(["script", "scenes", "images", "render"]);
    expect(stepsFor("product_ad", "voice").map((s) => s.key)).toContain("voice");
    expect(stepsFor("longform", "none").map((s) => s.key)).toContain("voice");
  });
});
