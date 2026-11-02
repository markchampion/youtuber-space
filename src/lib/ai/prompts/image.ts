import { isAdChannel, type ChannelProfile } from "@/lib/channel";

/** Product ads edit the uploaded product photo: this comes first so the model keeps the product as is. */
export const PRODUCT_FIDELITY =
  "Use the attached reference photo of the product: keep the product exactly as it is (same shape, proportions, colors, materials, label and logo) and place it in a new scene.";

// Style anchor + style lock are always added in code, never by the LLM.
export type Orientation = "landscape" | "portrait";

export function buildImagePrompt(
  p: ChannelProfile,
  scene: { description: string; background: string; frameType: string },
  orientation: Orientation = "landscape",
): string {
  const bg = p.visual.backgrounds.find((b) => b.key === scene.background);
  const frame = p.visual.frameTypes.find((f) => f.key === scene.frameType);
  const parts = [
    isAdChannel(p) ? PRODUCT_FIDELITY : "",
    p.visual.styleAnchor,
    scene.description.trim().replace(/\.$/, "") + ".",
    frame && !frame.textOnly ? `Composition: ${frame.description}` : "",
    bg ? `Background: ${bg.description}.` : "",
    orientation === "portrait" && isAdChannel(p)
      ? "Tall vertical 9:16 ad composition: the product large in the upper two thirds, keep the bottom quarter calm and uncluttered (captions go there)."
      : orientation === "portrait"
      ? "Tall vertical composition: stack the elements top to bottom, main subject centered, leave the bottom quarter simple (captions go there)."
      : "Wide 16:9 composition; keep heads, feet and key objects well inside the frame with some margin on every side.",
    orientation === "portrait" ? p.visual.styleLock.replace(/16:9( widescreen)?/i, "9:16 vertical portrait") : p.visual.styleLock,
  ];
  return parts.filter(Boolean).join(" ");
}

export function characterSheetPrompt(p: ChannelProfile): string {
  return [
    p.visual.styleAnchor,
    `Character reference sheet on a plain white background. Center: ${p.visual.mainCharacter}`,
    "Shown standing in a neutral pose, then a happy pose, then a worried pose, side by side.",
    `To the right, smaller: the character variants — ${p.visual.characterVariants.slice(0, 3).join("; ")}.`,
    p.visual.styleLock,
  ].join(" ");
}

export function isTextOnly(p: ChannelProfile, frameType: string) {
  return Boolean(p.visual.frameTypes.find((f) => f.key === frameType)?.textOnly);
}

/** Text-only frames with text are drawn by code; everything else needs an image. */
export function needsImage(p: ChannelProfile, scene: { frameType: string; onScreenText: string | null }) {
  return !(isTextOnly(p, scene.frameType) && scene.onScreenText?.trim());
}
