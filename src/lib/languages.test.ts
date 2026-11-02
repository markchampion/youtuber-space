import { describe, expect, it } from "vitest";
import { acceptPolish, buildSpokenText, captionChunks, splitSentences, wordCount } from "./sync";
import { polishEnabled } from "./channel";
import { LANGUAGES, getLanguage } from "./languages";
import { normalizeProfile } from "./channel-normalize";
import { ANCIENT_HUMANS_PROFILE } from "./channel-seed";
import { channelBrief, languageRule, scriptPrompt } from "./ai/prompts";

describe("languages", () => {
  it("splits Vietnamese sentences and keeps offsets exact", () => {
    const p = "Bạn thức dậy khi cơ thể sẵn sàng. Không có báo thức! Vì sao vậy?";
    const s = splitSentences(p, "vi");
    expect(s.map((x) => x.text)).toEqual(["Bạn thức dậy khi cơ thể sẵn sàng.", "Không có báo thức!", "Vì sao vậy?"]);
    for (const x of s) expect(p.slice(x.start, x.end)).toBe(x.text);
  });

  it("splits Japanese sentences that have no spaces", () => {
    expect(splitSentences("あなたは目を覚ます。目覚ましはない。", "ja").map((x) => x.text)).toEqual(["あなたは目を覚ます。", "目覚ましはない。"]);
  });

  it("counts words without spaces (Japanese) and with accents (Vietnamese)", () => {
    expect(wordCount("Bạn thức dậy", "vi")).toBe(3);
    expect(wordCount("あなたは目を覚ます", "ja")).toBeGreaterThan(2);
    expect(wordCount("You wake up.")).toBe(3);
  });

  it("chunks Japanese captions even though there are no spaces", () => {
    const c = captionChunks("あなたは毎朝自然に目を覚まします", 0, 3, 2, "ja");
    expect(c.length).toBeGreaterThan(1);
    expect(c.map((x) => x.text).join("")).toBe("あなたは毎朝自然に目を覚まします");
  });

  it("applies pronunciations to whole words with Vietnamese letters", () => {
    const { text } = buildSpokenText(["Đà Lạt và Đà Nẵng"], { "Đà Lạt": "Đà Lạt (Dalat)" });
    expect(text).toBe("Đà Lạt (Dalat) và Đà Nẵng");
  });

  it("every language has a font, and unknown codes fall back to English", () => {
    for (const l of LANGUAGES) expect(l.font).toBeTruthy();
    expect(getLanguage("xx").code).toBe("en");
    expect(normalizeProfile({ ...ANCIENT_HUMANS_PROFILE, language: "vi" }).language).toBe("vi");
    expect(normalizeProfile(ANCIENT_HUMANS_PROFILE).language).toBe("en");
  });

  it("tells Claude to write audience text natively in the channel language, as spoken language", () => {
    const vi = languageRule({ ...ANCIENT_HUMANS_PROFILE, language: "vi" });
    expect(vi).toMatch(/Vietnamese \(Tiếng Việt\)/);
    expect(vi).toMatch(/Never write it in English first and translate/);
    expect(vi).toMatch(/Viết văn NÓI/);
    const en = languageRule(ANCIENT_HUMANS_PROFILE);
    expect(en).toMatch(/^All output is in English\./);
    expect(en).toMatch(/contractions/);
    // Languages without a detailed guide still get the generic spoken-style rules.
    expect(languageRule({ ...ANCIENT_HUMANS_PROFILE, language: "es" })).toMatch(/native speaker talks/);
  });

  it("includes the voice sample in the channel brief only when set", () => {
    expect(channelBrief({ ...ANCIENT_HUMANS_PROFILE, voiceSample: "Ní ơi, nghe nè!" })).toMatch(/<voice_sample>\nNí ơi, nghe nè!/);
    expect(channelBrief(ANCIENT_HUMANS_PROFILE)).not.toMatch(/voice_sample/);
  });

  it("runs the natural-speech pass by default for non-English channels only", () => {
    expect(polishEnabled({ ...ANCIENT_HUMANS_PROFILE, language: "vi" })).toBe(true);
    expect(polishEnabled(ANCIENT_HUMANS_PROFILE)).toBe(false);
    expect(polishEnabled({ ...ANCIENT_HUMANS_PROFILE, language: "vi", polishPass: false })).toBe(false);
  });

  it("only accepts a polished script that keeps the same paragraphs", () => {
    expect(acceptPolish("A.\n\nB.", "A!\n\nB!")).toBe(true);
    expect(acceptPolish("A.\n\nB.", "A. B.")).toBe(false);
  });

  it("keeps outline notes out of the spoken beats in the script prompt", () => {
    const prompt = scriptPrompt(ANCIENT_HUMANS_PROFILE, "T", {
      sections: [{ key: "hook", title: "Hook", beats: ["Ní ơi"], notes: ["FACT-CHECK: one heart stops"] }],
      evidence: [],
    });
    expect(prompt).toMatch(/<outline>[\s\S]*Ní ơi[\s\S]*<\/outline>/);
    expect(prompt).toMatch(/<creator_notes>[\s\S]*never say them out loud[\s\S]*FACT-CHECK/);
    expect(prompt.slice(prompt.indexOf("<outline>"), prompt.indexOf("</outline>"))).not.toMatch(/FACT-CHECK/);
  });
});
