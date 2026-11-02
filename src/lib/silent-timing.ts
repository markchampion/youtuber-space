/** Reading pace for silent, text-led ads: how long each line stays on screen. */
export const SILENT_PACE = { wordsPerSecond: 2.5, minSeconds: 2.2, maxSeconds: 4 };

/** Start/end (seconds) for each sentence when there is no voice; lines follow each other with no gap. */
export function silentTimings(wordCounts: number[]): { start: number; end: number }[] {
  let t = 0;
  return wordCounts.map((n) => {
    const d = Math.min(SILENT_PACE.maxSeconds, Math.max(SILENT_PACE.minSeconds, n / SILENT_PACE.wordsPerSecond));
    const span = { start: t, end: Math.round((t + d) * 1000) / 1000 };
    t = span.end;
    return span;
  });
}
