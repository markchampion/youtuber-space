import { describe, expect, it } from "vitest";
import { ANCIENT_HUMANS_PROFILE as seed } from "./channel-seed";
import { normalizeProfile } from "./channel-normalize";
import { genreOf, type ChannelProfile } from "./channel";
import { DRAMA_OUTLINE_TEMPLATE, chapterOfKey } from "./outline-templates";
import { CASUAL_RULES, DRAMA_RULES, FICTION_RULE, channelBrief, outlinePrompt, scriptChapterPrompt, scriptPrompt } from "./ai/prompts";
import type { Outline } from "./types";

const { outlineTemplate: _t, ...noTemplate } = seed;
void _t;
const drama: ChannelProfile = normalizeProfile({ ...noTemplate, genre: "drama", language: "vi" });

const outline: Outline = {
  sections: DRAMA_OUTLINE_TEMPLATE.beats.map((b) => ({ key: b.key, title: b.name, beats: [`beat for ${b.key}`] })),
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
    expect(drama.outlineTemplate?.beats.every((b) => b.chapter)).toBe(true);
  });

  it("drama prompts allow invented characters and use the drama rules", () => {
    const brief = channelBrief(drama);
    expect(brief).toContain(FICTION_RULE);
    expect(brief).not.toContain("never invent a name");
    const o = outlinePrompt(drama, "T");
    expect(o).toContain("story bible");
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
  });
});
