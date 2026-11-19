import { describe, expect, it } from "vitest";
import { seriesContext, seriesPlanPrompt } from "./index";
import { SeriesPlanSchema } from "@/lib/types";

const series = {
  title: "The Fall of Rome",
  premise: "How the empire came apart, in three parts.",
  episodes: [
    { title: "The Crisis", hook: "h1", covers: ["inflation", "the army"], teaser: "Next: the split." },
    { title: "The Split", hook: "h2", covers: ["Diocletian", "two capitals"], teaser: "Next: the sack." },
    { title: "The Sack", hook: "h3", covers: ["Alaric", "410 AD"], teaser: "" },
  ],
};

describe("seriesContext", () => {
  it("first episode: no recap, lists later episodes, teases the next", () => {
    const c = seriesContext(series, 1);
    expect(c).toContain("episode 1 of 3");
    expect(c).not.toContain("Earlier episodes");
    expect(c).toContain('Episode 2: "The Split"');
    expect(c).not.toContain("recap");
    expect(c).toContain('tease of the next episode ("The Split")');
    expect(c).toContain("Next: the split.");
  });

  it("middle episode: recap, both neighbours, no repeat", () => {
    const c = seriesContext(series, 2);
    expect(c).toContain('Episode 1: "The Crisis" — inflation; the army');
    expect(c).toContain('Episode 3: "The Sack"');
    expect(c).toContain("This episode covers: Diocletian; two capitals");
    expect(c).toContain("recap");
    expect(c).toContain("Don't retell");
    expect(c).toContain("Don't use material that belongs to later episodes");
  });

  it("last episode: closes the series, no later episodes", () => {
    const c = seriesContext(series, 3);
    expect(c).not.toContain("Later episodes");
    expect(c).toContain("final episode");
    expect(c).not.toContain("tease of the next episode");
  });

  it("clamps an out-of-range episode number", () => {
    expect(seriesContext(series, 9)).toContain("episode 3 of 3");
    expect(seriesContext(series, 0)).toContain("episode 1 of 3");
  });
});

describe("seriesPlanPrompt", () => {
  it("asks for the episode count and lists titles to avoid", () => {
    const p = seriesPlanPrompt({ topic: "Rome", episodes: 4, avoid: ["Old Video"] });
    expect(p).toContain("series of 4 long videos");
    expect(p).toContain("- Old Video");
  });
});

describe("SeriesPlanSchema", () => {
  it("accepts a valid plan and rejects a missing field", () => {
    expect(SeriesPlanSchema.parse(series).episodes).toHaveLength(3);
    expect(() => SeriesPlanSchema.parse({ ...series, episodes: [{ title: "x" }] })).toThrow();
  });
});
