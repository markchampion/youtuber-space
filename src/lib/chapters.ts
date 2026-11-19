/**
 * A drama story project keeps the whole story in one script, with a marker line before each chapter:
 *
 *   ## Chương 2: Cuốn sổ bìa nâu
 *
 * The story project is never voiced; each chapter is copied (without its marker) into its own video project.
 */
export type StoryChapter = { n: number; title: string; text: string };

const MARKER = /^##\s*(?:Chương|Chapter|Phần|Part)\s+(\d+)\s*(?:[:.–—-]\s*(.*))?$/i;

/** The word used in chapter markers for a language. */
export function chapterWord(language?: string) {
  return (language ?? "en").toLowerCase().startsWith("vi") ? "Chương" : "Chapter";
}

export function chapterHeader(n: number, title: string, language?: string) {
  return `## ${chapterWord(language)} ${n}${title.trim() ? `: ${title.trim()}` : ""}`;
}

/** True when the script has at least one chapter marker line. */
export function hasChapters(script: string | null | undefined): boolean {
  return Boolean(script) && script!.split("\n").some((l) => MARKER.test(l.trim()));
}

/** Split a story script into chapters. Text before the first marker (if any) is dropped. */
export function splitChapters(script: string | null | undefined): StoryChapter[] {
  const out: StoryChapter[] = [];
  let cur: { n: number; title: string; lines: string[] } | null = null;
  for (const line of (script ?? "").split("\n")) {
    const m = MARKER.exec(line.trim());
    if (m) {
      if (cur) out.push({ n: cur.n, title: cur.title, text: cur.lines.join("\n").trim() });
      cur = { n: Number(m[1]), title: (m[2] ?? "").trim(), lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) out.push({ n: cur.n, title: cur.title, text: cur.lines.join("\n").trim() });
  return out;
}

/** Inverse of splitChapters. */
export function joinChapters(chapters: StoryChapter[], language?: string): string {
  return chapters.map((c) => `${chapterHeader(c.n, c.title, language)}\n\n${c.text.trim()}`).join("\n\n");
}
