import { isAdChannel, type ChannelProfile } from "@/lib/channel";

export type ChannelArtKind = "avatar" | "banner";

/** The style lock without its "no text" and 16:9 rules: channel art shows the name and has its own shape. */
export function artLock(p: ChannelProfile, shape: string) {
  return p.visual.styleLock
    .replace(/\.\s*$/, "")
    .split(",")
    .map((part) => part.trim())
    // No text rules (the art shows the name) and no reference-photo rules (channel art has no reference photo).
    .filter((part) => part && !/\b(text|letters)\b|reference photo/i.test(part))
    .map((part) => part.replace(/16:9( widescreen)?/i, shape))
    .join(", ")
    .concat(".");
}

function palette(p: ChannelProfile) {
  const colors = p.visual.palette.slice(0, 6).map((c) => `${c.name} ${c.hex}`);
  return colors.length ? `Color palette: ${colors.join(", ")}.` : "";
}

/** What represents the channel visually: its main character, or for product-ad channels a brand mark. */
function subject(p: ChannelProfile) {
  return isAdChannel(p)
    ? `A simple, memorable brand mark for a shop about: ${p.niche}`
    : `The channel's main character: ${p.visual.mainCharacter}`;
}

/** Short names are written in full; long ones become initials so they stay readable at 48 px. */
export function avatarText(name: string) {
  const clean = name.trim();
  if (clean.length <= 14) return clean;
  return clean
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w))
    .slice(0, 3)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function avatarPrompt(p: ChannelProfile, opts: { withName: boolean }) {
  const text = avatarText(p.name);
  return [
    p.visual.styleAnchor,
    "Channel profile picture (avatar), square.",
    `${subject(p)}. Show it as a single bold, centered icon (head and shoulders for a character) that still reads clearly when shown tiny, at 48 px.`,
    "Keep everything important inside the central circle: the corners will be cropped away. Plain or very simple background.",
    opts.withName ? `Write "${text}" once, in big, bold, clean letters, spelled exactly like that, under or around the icon. No other text.` : "No text or letters at all.",
    palette(p),
    artLock(p, "1:1 square"),
  ]
    .filter(Boolean)
    .join(" ");
}

export function bannerPrompt(p: ChannelProfile, opts: { withName: boolean }) {
  return [
    p.visual.styleAnchor,
    `Wide channel banner (cover image) for a channel about: ${p.niche}.`,
    opts.withName
      ? `The channel name "${p.name.trim()}" written once in large, bold, clean letters, spelled exactly like that, centered horizontally and vertically. The name and the key art must fit inside the middle 60% of the width and the middle 30% of the height: that strip is all a phone shows.`
      : "Put the key art in the middle 60% of the width and the middle 30% of the height: that strip is all a phone shows. No text or letters at all.",
    `${subject(p)}, placed next to the ${opts.withName ? "name" : "center"}.`,
    "Fill the rest of the frame (top, bottom, far left and right) with decorative scenery and patterns from the channel's world that can be cropped away without losing anything. No small text, logos or watermarks.",
    palette(p),
    artLock(p, "16:9 widescreen"),
  ]
    .filter(Boolean)
    .join(" ");
}
