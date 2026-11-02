import { describe, expect, it } from "vitest";
import { EDIT_COALESCE_MS, changedLines, versionAction } from "./history-rules";

const t0 = Date.parse("2026-09-25T10:00:00Z");
const at = (ms: number) => new Date(t0 + ms).toISOString();

describe("versionAction", () => {
  it("skips content identical to the latest version", () => {
    expect(versionAction({ content: "a", source: "ai", createdAt: at(0) }, "a", "edit", t0)).toBe("skip");
  });
  it("merges manual edits made within the window, inserts after it", () => {
    const latest = { content: "a", source: "edit" as const, createdAt: at(0) };
    expect(versionAction(latest, "ab", "edit", t0 + 60_000)).toBe("update");
    expect(versionAction(latest, "ab", "edit", t0 + EDIT_COALESCE_MS + 1)).toBe("insert");
  });
  it("never merges AI, rewrite or restore versions", () => {
    const latestEdit = { content: "a", source: "edit" as const, createdAt: at(0) };
    for (const src of ["ai", "rewrite", "restore"] as const) expect(versionAction(latestEdit, "b", src, t0 + 1000)).toBe("insert");
    // An edit right after an AI version starts a new version rather than overwriting the AI one.
    expect(versionAction({ content: "a", source: "ai", createdAt: at(0) }, "b", "edit", t0 + 1000)).toBe("insert");
  });
  it("inserts the first version", () => {
    expect(versionAction(undefined, "x", "edit", t0)).toBe("insert");
  });
});

it("highlights lines that are new compared to the current text", () => {
  expect([...changedLines("one\ntwo", "one\nTWO\nthree")]).toEqual([1, 2]);
});
