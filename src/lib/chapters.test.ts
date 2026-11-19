import { describe, expect, it } from "vitest";
import { chapterHeader, hasChapters, joinChapters, splitChapters } from "./chapters";

describe("story chapters", () => {
  const chapters = [
    { n: 1, title: "Đêm mưa", text: "Rầm! Cánh cửa bật tung.\n\nThưa quý cô bác." },
    { n: 2, title: "", text: "Choang! Ở phần trước." },
  ];

  it("round-trips through the script text", () => {
    const script = joinChapters(chapters, "vi");
    expect(script.startsWith("## Chương 1: Đêm mưa")).toBe(true);
    expect(script).toContain("## Chương 2\n");
    expect(splitChapters(script)).toEqual(chapters);
  });

  it("reads English and loose markers, and ignores text before the first one", () => {
    expect(splitChapters("intro\n## Chapter 3 – The truth\nText.")).toEqual([{ n: 3, title: "The truth", text: "Text." }]);
    expect(chapterHeader(2, "X", "en")).toBe("## Chapter 2: X");
  });

  it("knows when a script has no chapters", () => {
    expect(hasChapters("Just a script.\n\nNo markers.")).toBe(false);
    expect(splitChapters("Just a script.")).toEqual([]);
    expect(hasChapters(joinChapters(chapters, "vi"))).toBe(true);
  });
});
