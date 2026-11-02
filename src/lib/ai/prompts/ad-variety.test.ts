import { describe, expect, it } from "vitest";
import { VISUAL_DIRECTIONS, pickVariant } from "./ad-variety";

describe("pickVariant", () => {
  it("never repeats a direction while unused ones remain", () => {
    const used: string[] = [];
    for (let i = 0; i < VISUAL_DIRECTIONS.length; i++) {
      const v = pickVariant(used);
      expect(used).not.toContain(v);
      used.unshift(v);
    }
    expect(new Set(used).size).toBe(VISUAL_DIRECTIONS.length);
  });

  it("reuses the least recently used once all are taken", () => {
    const used = [...VISUAL_DIRECTIONS]; // newest first
    expect(pickVariant(used)).toBe(VISUAL_DIRECTIONS.at(-1));
  });

  it("ignores empty history entries", () => {
    expect(VISUAL_DIRECTIONS).toContain(pickVariant([null, undefined, ""]));
  });
});
