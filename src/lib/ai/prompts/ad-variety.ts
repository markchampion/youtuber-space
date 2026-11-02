/**
 * Visual directions for product ads. Each video of a product gets one it hasn't used yet, so
 * re-using a product produces a clearly different set of images every time.
 */
export const VISUAL_DIRECTIONS = [
  "bright morning kitchen, warm sunlight through a window",
  "minimal studio, pastel color-block backdrop and soft shadows",
  "outdoor café table, city street softly blurred behind",
  "flat-lay from directly above on a textured surface with a few curated props",
  "night city, neon reflections and moody contrast",
  "gym and active lifestyle, energetic and sporty",
  "travel day: airport lounge, suitcase and passport nearby",
  "cozy home desk with plants and a warm lamp",
  "clean bathroom shelf, white tiles and fresh towels",
  "picnic on green grass in golden-hour light",
  "beach and summer, sand, bright sky and turquoise water",
  "rainy-day window, soft gray light and a warm blanket",
  "luxury look: dark marble, gold accents, dramatic spotlight",
  "nature trail, forest greens and dappled light",
  "colorful pop-art set with bold geometric shapes",
  "festive season, gift wrap, bokeh lights and warm tones",
  "busy morning commute, car cup holder and city motion",
  "minimal Japanese-style interior, natural wood and calm light",
  "friends hanging out at home, candid and fun",
  "macro product-detail studio: water droplets, textures, crisp light",
] as const;

/**
 * Pick a direction not used by earlier videos of the same product (random among the unused ones).
 * Once all are used, start over, preferring the least recently used.
 */
export function pickVariant(used: readonly (string | null | undefined)[], rand: () => number = Math.random): string {
  const usedSet = new Set(used.filter(Boolean));
  const fresh = VISUAL_DIRECTIONS.filter((d) => !usedSet.has(d));
  if (fresh.length) return fresh[Math.floor(rand() * fresh.length)];
  // All used: take the one used longest ago (`used` is newest first).
  const lastIndex = (d: string) => used.indexOf(d);
  return [...VISUAL_DIRECTIONS].sort((a, b) => lastIndex(b) - lastIndex(a))[0];
}
