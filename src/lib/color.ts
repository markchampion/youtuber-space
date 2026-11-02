// Pure color maths shared by the renderer (Remotion) and the channel editor. No imports: Remotion bundles this.

/** WCAG relative luminance of a #RRGGBB color, 0 (black) – 1 (white). Unparseable colors count as light. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (none) – 21 (black on white). 4.5 reads comfortably; under 3 is hard to read. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const LIGHT_INK = "#FFFFFF";
export const DARK_INK = "#1C1917";

/** Outline for colored text over a photo: white by default, dark when the text itself is too light for a white edge. */
export function outlineFor(text: string): string {
  return contrastRatio(text, LIGHT_INK) >= 3 ? LIGHT_INK : DARK_INK;
}

/** White or near-black, whichever reads better on `bg`. */
export function readableOn(bg: string): string {
  return contrastRatio(LIGHT_INK, bg) >= contrastRatio(DARK_INK, bg) ? LIGHT_INK : DARK_INK;
}
