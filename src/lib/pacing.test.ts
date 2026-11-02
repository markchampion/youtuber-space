import { describe, expect, it } from "vitest";
import { ANCIENT_HUMANS_PROFILE as seed } from "./channel-seed";
import { normalizeProfile } from "./channel-normalize";
import { DEFAULT_PACING, lengthBudget, needsTrim, pacingOf } from "./channel";
import { OUTLINE_TEMPLATES } from "./outline-templates";
import { CASUAL_RULES, beatBudgets, outlinePrompt, scenesPrompt, scriptPrompt } from "./ai/prompts";
import { estimateMinutes, longSentences, transcriptStats } from "./sync";

describe("pacing & templates", () => {
  it("fills default pacing and the story template, and clamps bad values", () => {
    const p = normalizeProfile(seed);
    expect(p.pacing).toEqual(DEFAULT_PACING);
    expect(p.outlineTemplate?.name).toBe("Story mystery explainer");
    const q = normalizeProfile({ ...seed, pacing: { maxWordsPerSentence: 1, wordsPerMinute: 999, sentencesPerImage: 9, cameraCuts: false } });
    expect(q.pacing).toEqual({ maxWordsPerSentence: 5, wordsPerMinute: 260, sentencesPerImage: 4, cameraCuts: false });
  });

  it("the outline prompt lists every template part in order, plus the casual-viewer rules", () => {
    const t = OUTLINE_TEMPLATES[0];
    const prompt = outlinePrompt(seed, "Title", null, t);
    let at = -1;
    for (const b of t.beats) {
      const i = prompt.indexOf(`key="${b.key}"`);
      expect(i).toBeGreaterThan(at);
      at = i;
    }
    expect(prompt).toContain(CASUAL_RULES);
  });

  it("script and scene prompts carry the pacing", () => {
    const p = { ...seed, pacing: { ...DEFAULT_PACING, maxWordsPerSentence: 12, sentencesPerImage: 2 } };
    expect(scriptPrompt(p, "T", { sections: [], evidence: [] })).toMatch(/at most 12 words/);
    expect(scenesPrompt(p, "0: a", 1)).toMatch(/about 2 sentences/);
  });

  it("counts long sentences per language", () => {
    const s = "Short one. This sentence is clearly much longer than the tiny limit we set here.\n\nOk.";
    expect(longSentences(s, "en", 8).map((x) => x.paragraph)).toEqual([0]);
    expect(longSentences("Bạn thức dậy. Không có báo thức nào reo cả vì trời còn rất sớm lắm.", "vi", 8)).toHaveLength(1);
  });

  it("estimates minutes from the channel's words per minute", () => {
    expect(estimateMinutes(1700, 170)).toBe(10);
  });

  it("measures a pasted transcript, stripping timestamps", () => {
    const t = "0:00 This morning, a machine screamed at you. 0:04 You silenced it.\n1:30 Now rewind fifty thousand years.";
    const st = transcriptStats(t);
    expect(st.text.startsWith("This morning")).toBe(true);
    expect(st.sentences).toBe(3);
    expect(st.wordsPerMinute).toBe(Math.round(st.words / 1.5));
  });
});

describe("video length", () => {
  const short = normalizeProfile({ ...seed, lengthMinutes: { min: 1, max: 3 }, pacing: { ...DEFAULT_PACING, wordsPerMinute: 150 } });

  it("turns minutes into words at the configured speed, and drops the old word count", () => {
    const b = lengthBudget(short);
    expect([b.minWords, b.maxWords, b.wpm, b.measured]).toEqual([150, 450, 150, false]);
    expect(b.targetWords).toBe(405);
    expect(short.scriptWords).toBeUndefined();
  });

  it("prefers the voice's measured speed once known", () => {
    const measured = normalizeProfile({ ...short, pacing: { ...pacingOf(short), measuredWpm: 134 } });
    const b = lengthBudget(measured);
    expect([b.wpm, b.maxWords, b.measured]).toEqual([134, 402, true]);
  });

  it("reads old word-only profiles as minutes, and clamps bad minutes", () => {
    const old = normalizeProfile({ ...seed, lengthMinutes: undefined, scriptWords: { min: 170, max: 450 } });
    expect(old.lengthMinutes).toEqual({ min: 1, max: 2.75 });
    const bad = normalizeProfile({ ...seed, lengthMinutes: { min: 5, max: 2 } });
    expect(bad.lengthMinutes).toEqual({ min: 5, max: 5 });
    expect(normalizeProfile({ ...seed, pacing: { ...DEFAULT_PACING, measuredWpm: 5 } }).pacing?.measuredWpm).toBe(60);
  });

  it("puts per-part word budgets and the hard limit in the prompts", () => {
    const outline = outlinePrompt(short, "Title");
    expect(outline).toMatch(/key="[a-z_]+", .+ \(~\d+ words, ~\d+s\)/);
    expect(outline).toContain("about 405 words");
    const script = scriptPrompt(short, "T", { sections: [{ key: "a", title: "A", beats: ["x"] }], evidence: [] });
    expect(script).toContain("Hard limit: at most 450 words");
    expect(script).toContain("Part budgets:");
    const parts = beatBudgets(short).reduce((a, x) => a + x.words, 0);
    expect(Math.abs(parts - 405)).toBeLessThanOrEqual(beatBudgets(short).length);
  });

  it("trims only when clearly over the max", () => {
    const b = lengthBudget(short);
    expect(needsTrim(470, b)).toBe(false);
    expect(needsTrim(514, b)).toBe(true);
  });
});
