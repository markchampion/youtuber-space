import type { ChannelProfile } from "@/lib/channel";
import { artLock } from "./channel-art";

/** Concepts only include the main character when a human reaction helps (see metadataPrompt). */
export function showsMainCharacter(concept: string) {
  return /\bmain character\b/i.test(concept);
}

/**
 * Image prompt for a YouTube thumbnail from one concept. The title's subject is the hero, not the
 * channel's character; the character is described only when the concept puts them in the frame.
 */
export function thumbnailPrompt(p: ChannelProfile, title: string, concept: string) {
  const v = p.visual;
  return [
    v.styleAnchor,
    `Thumbnail for a YouTube video titled "${title.trim()}". The image must be clearly about that title: its subject is the hero and recognizable at a glance.`,
    `High click-through YouTube thumbnail: ${concept.trim().replace(/\.$/, "")}.`,
    "One big focal subject, the title's subject, that reads instantly on a small phone screen. Dramatic lighting and strong contrast: the subject is bright and sharp against a darker, simpler background.",
    "Build the mood the concept names through light, color and atmosphere (for mystery: darkness, fog or haze, one eerie light source, silhouettes, something partly hidden). Make the viewer need to know what is going on.",
    "Draw the thumbnail text from the concept, and only that text: huge, bold, high-contrast letters with a thick outline, spelled exactly as given, in an empty area away from the subject. No other words, logos or watermarks.",
    showsMainCharacter(concept)
      ? `The main character looks exactly like this: ${v.mainCharacter}. If a reference image is attached, match it (face, hair, colors, clothes, line style). Keep them secondary to the subject.`
      : "",
    artLock(p, "16:9 widescreen"),
  ]
    .filter(Boolean)
    .join(" ");
}
