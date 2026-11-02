// Visual style presets offered when creating a channel. `prompt` is what Claude builds the visual system from.
export type StylePreset = { key: string; label: string; blurb: string; prompt: string; swatch: string[] };

export const STYLE_PRESETS: StylePreset[] = [
  {
    key: "doodle",
    label: "Stick-figure doodle",
    blurb: "Hand-drawn marker doodles, flat colors, round-headed stick figures.",
    prompt:
      "Hand-drawn 2D doodle cartoon: flat solid colors, bold black wobbly marker outlines, a stick-figure main character with a big round white head and one distinctive hair color, chunky simple props, flat color-block backgrounds, zero gradients or shadows.",
    swatch: ["#F58220", "#7FB5D5", "#F5F1E6", "#1C1917"],
  },
  {
    key: "infographic",
    label: "Flat infographic",
    blurb: "Clean vector shapes, icons and simple charts, faceless characters.",
    prompt:
      "Flat vector infographic illustration: clean geometric shapes, a limited modern palette, simple faceless characters, icons, arrows and simple charts, generous negative space, no outlines or thin uniform outlines, no gradients.",
    swatch: ["#2563EB", "#F59E0B", "#F8FAFC", "#0F172A"],
  },
  {
    key: "storybook",
    label: "Storybook watercolor",
    blurb: "Soft hand-painted look, warm muted colors, gentle characters.",
    prompt:
      "Soft storybook watercolor illustration: hand-painted edges, warm muted palette, paper grain, simple rounded characters with dot eyes, cozy readable compositions, no photorealism.",
    swatch: ["#C2410C", "#65A30D", "#FEF3C7", "#44403C"],
  },
  {
    key: "lineart",
    label: "Minimal line art",
    blurb: "Black ink lines on off-white paper with one accent color.",
    prompt:
      "Minimal ink line art: confident black single-weight lines on off-white paper, one accent color used sparingly, expressive simple characters, lots of white space, no shading.",
    swatch: ["#111827", "#DC2626", "#FAFAF9", "#9CA3AF"],
  },
];
