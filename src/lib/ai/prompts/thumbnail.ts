import { isDrama, type ChannelProfile } from "@/lib/channel";
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
  if (isDrama(p)) return dramaThumbnailPrompt(title, concept);
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

/**
 * Family-drama channels: the format those channels use in the feed. It looks like a still from a
 * TV drama, not like the channel's illustrated scenes, with a stacked text block (red tag, a
 * yellow and red headline, a blue banner) on the left and the characters' conflict on the right.
 */
function dramaThumbnailPrompt(title: string, concept: string) {
  return [
    `YouTube thumbnail for a Vietnamese family-drama story video titled "${title.trim()}".`,
    "Hyper-realistic cinematic photo, like a still from a Vietnamese TV drama: real Vietnamese people with natural skin texture, tears and wrinkles, sharp focus on the faces, rich saturated warm colors, strong contrast, a dim lived-in Vietnamese home behind them with soft background blur.",
    `Concept: ${concept.trim().replace(/\.$/, "")}.`,
    "Layout: the left ~45% of the frame is the text block and the right ~55% holds the characters. Faces are big (each face at least a fifth of the frame height), with emotions pushed to the extreme so they read on a small phone screen; the nearest character is closest to the camera on the far right. The characters never cover the text.",
    'Text block, stacked and left-aligned, top to bottom: the Tag in white on a small red rounded badge with a white outline; the Headline as two giant lines of heavy condensed sans-serif capitals (like Impact), line 1 bright yellow and line 2 bright red, each with a thick black outline and a drop shadow, as wide as the text block; the Banner in white italic capitals on a slanted bright blue ribbon under the headline. If the concept gives only one line of text, use it as the headline and leave out the rest.',
    "Write only the words the concept gives, spelled exactly, with every Vietnamese accent mark correct. No other words, logos, watermarks or subtitles.",
    "Everyone fully clothed. No distorted hands, no extra fingers, no Western faces. 16:9 widescreen.",
  ].join(" ");
}
