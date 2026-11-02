// Pure rules for script/outline version history (unit-tested in history.test.ts).

export type VersionSource = "ai" | "edit" | "rewrite" | "restore" | "initial";

/** Manual edits within this window update the same version (autosave fires every ~800 ms). */
export const EDIT_COALESCE_MS = 10 * 60_000;

export type LatestVersion = { content: string; source: VersionSource; createdAt: string } | undefined;

/** What to do with new content: skip it, merge it into the latest version, or add a new one. */
export function versionAction(latest: LatestVersion, content: string, source: VersionSource, now = Date.now()): "skip" | "update" | "insert" {
  if (latest && latest.content === content) return "skip";
  if (latest && source === "edit" && latest.source === "edit" && now - Date.parse(latest.createdAt) < EDIT_COALESCE_MS) return "update";
  return "insert";
}

/** Lines of `next` that aren't in `prev`: a light "what changed" highlight for the preview. */
export function changedLines(prev: string, next: string): Set<number> {
  const before = new Set(prev.split("\n").map((l) => l.trim()));
  const out = new Set<number>();
  next.split("\n").forEach((l, i) => {
    if (l.trim() && !before.has(l.trim())) out.add(i);
  });
  return out;
}
