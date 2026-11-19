import { describe, expect, it } from "vitest";
import { ANCIENT_HUMANS_PROFILE as seed } from "./channel-seed";
import { normalizeProfile } from "./channel-normalize";
import { genreOf, type ChannelProfile } from "./channel";
import { DRAMA_OUTLINE_TEMPLATE, chapterOfKey, expandDramaTemplate } from "./outline-templates";
import { CASUAL_RULES, DRAMA_RULES, FICTION_RULE, channelBrief, outlinePrompt, scriptChapterPrompt, scriptPrompt } from "./ai/prompts";
import type { Outline } from "./types";

const { outlineTemplate: _t, ...noTemplate } = seed;
void _t;
const drama: ChannelProfile = normalizeProfile({ ...noTemplate, genre: "drama", language: "vi" });

const outline: Outline = {
  sections: expandDramaTemplate(DRAMA_OUTLINE_TEMPLATE, 3).beats.map((b) => ({ key: b.key, title: b.name, beats: [`beat for ${b.key}`] })),
  evidence: ["Trần Văn Lộc – bảy mươi sáu tuổi – giáo viên về hưu – Hà Đông"],
};

describe("drama genre", () => {
  it("existing channels stay explainers and keep their prompts", () => {
    const p = normalizeProfile(seed);
    expect(genreOf(p)).toBe("explainer");
    expect(channelBrief(p)).toContain("never invent a name");
    expect(scriptPrompt(p, "T", outline)).toContain(CASUAL_RULES);
  });

  it("a drama channel without its own structure gets the drama template", () => {
    expect(drama.genre).toBe("drama");
    expect(drama.outlineTemplate?.name).toBe(DRAMA_OUTLINE_TEMPLATE.name);
    expect(drama.outlineTemplate?.beats.every((b) => b.role)).toBe(true);
  });

  it("drama prompts allow invented characters and use the drama rules", () => {
    const brief = channelBrief(drama);
    expect(brief).toContain(FICTION_RULE);
    expect(brief).not.toContain("never invent a name");
    const o = outlinePrompt(drama, "T");
    expect(o).toContain("story bible");
    expect(o).toContain("Decide how many chapters");
    const fixed = outlinePrompt(drama, "T", null, undefined, 5);
    expect(fixed).toContain("exactly 5 chapters");
    expect(fixed).toContain('key="c5_moral_cta"');
    expect(fixed).not.toContain('key="c6_');
    expect(o).toContain(DRAMA_RULES);
    expect(o).not.toContain(CASUAL_RULES);
  });

  it("chapter prompts mark only their own sections and carry the story so far", () => {
    expect(chapterOfKey("c2_reveal")).toBe(2);
    expect(chapterOfKey("hook")).toBeNull();
    const first = scriptChapterPrompt(drama, "T", outline, 1, 3, "");
    expect(first).toContain(">>> [chapter 1]");
    expect(first).not.toContain(">>> [chapter 2]");
    expect(first).not.toContain("<story_so_far>");
    const last = scriptChapterPrompt(drama, "T", outline, 3, 3, "Chương một đã viết.");
    expect(last).toContain("<story_so_far>\nChương một đã viết.");
    expect(last).toContain("This is the last chapter");
    // Every chapter is its own video: later chapters recap, non-final chapters end with a CTA for the next part.
    expect(scriptChapterPrompt(drama, "T", outline, 2, 3, "x")).toContain("Ở phần trước");
    expect(scriptChapterPrompt(drama, "T", outline, 2, 3, "x")).toContain("part 3");
  });
});

describe("expandDramaTemplate", () => {
  const roles = (n: number) => [...new Set(expandDramaTemplate(DRAMA_OUTLINE_TEMPLATE, n).beats.map((b) => `${chapterOfKey(b.key)}:${b.role}`))];
  it("uses first / middle… / last beats", () => {
    expect(roles(1)).toEqual(["1:first", "1:last"]);
    expect(roles(2)).toEqual(["1:first", "2:last"]);
    expect(roles(3)).toEqual(["1:first", "2:middle", "3:last"]);
    expect(roles(8)).toHaveLength(8);
    expect(roles(8)[6]).toBe("7:middle");
  });
  it("keeps keys unique", () => {
    const keys = expandDramaTemplate(DRAMA_OUTLINE_TEMPLATE, 6).beats.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
