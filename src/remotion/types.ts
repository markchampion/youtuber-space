/** A camera framing of the scene image; the picture cuts to the next one at each sentence. */
export type Shot = { fromFrame: number; framing: "wide" | "left" | "right" | "center" };

export type VideoScene = {
  id: string;
  fromFrame: number;
  durationInFrames: number;
  shots: Shot[]; // frames relative to the scene start
  imageUrl: string | null;
  textOnly: boolean;
  onScreenText: string | null;
  textPlacement: "center" | "top";
  bgColor: string;
};

import type { FontKey } from "../lib/languages";

export type WatermarkProps = {
  text: string;
  logoUrl: string | null;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  opacity: number;
};

export type VideoCaption = { text: string; fromFrame: number; toFrame: number };

export type VideoProps = {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  audioUrl: string | null;
  /** Speeds up/slows down the voice (pitch preserved); timings are already scaled to match. */
  playbackRate: number;
  scenes: VideoScene[];
  captions: VideoCaption[];
  showCaptions: boolean;
  kenBurns: boolean;
  crossfadeFrames: number;
  textColor: string;
  paperColor: string;
  /** Hand-drawn font covering the channel language's script. */
  fontKey: FontKey;
  watermark: WatermarkProps | null;
};

export const EMPTY_VIDEO: VideoProps = {
  fps: 30,
  width: 1920,
  height: 1080,
  durationInFrames: 30,
  audioUrl: null,
  playbackRate: 1,
  scenes: [],
  captions: [],
  showCaptions: false,
  kenBurns: true,
  crossfadeFrames: 6,
  textColor: "#E0302B",
  paperColor: "#F5F1E6",
  fontKey: "marker",
  watermark: null,
};

export type ShortScene = {
  id: string;
  fromFrame: number;
  durationInFrames: number;
  shots: Shot[];
  imageUrl: string | null; // the long video's 16:9 image (stacked layout)
  verticalImageUrl: string | null; // 9:16 image (fullscreen layout)
  textOnly: boolean;
  onScreenText: string | null;
  bgColor: string;
};

export type ShortProps = {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  audioUrl: string | null;
  /** Frames of the long narration to skip / stop at (the clip window). */
  audioTrimBefore: number;
  audioTrimAfter: number;
  /** Playback speed (voice pitch kept); all frame numbers are already at this speed. */
  playbackRate: number;
  title: string;
  /** "PART 2/10" for a series part, else null. */
  partLabel: string | null;
  /** Shown in the last seconds of a series part ("Part 3 next →"), else null. */
  endNote: string | null;
  layout: "stacked" | "fullscreen";
  scenes: ShortScene[];
  captions: VideoCaption[];
  crossfadeFrames: number;
  textColor: string;
  paperColor: string;
  /** Captions drawn on the paper in the stacked layout; already resolved from the channel setting (or auto). */
  captionColor: string;
  /** Hand-drawn font covering the channel language's script. */
  fontKey: FontKey;
  watermark: WatermarkProps | null;
};

export const EMPTY_SHORT: ShortProps = {
  fps: 30,
  width: 1080,
  height: 1920,
  durationInFrames: 30,
  audioUrl: null,
  audioTrimBefore: 0,
  audioTrimAfter: 30,
  playbackRate: 1,
  title: "",
  partLabel: null,
  endNote: null,
  layout: "stacked",
  scenes: [],
  captions: [],
  crossfadeFrames: 6,
  textColor: "#E0302B",
  paperColor: "#F5F1E6",
  captionColor: "#1C1917",
  fontKey: "marker",
  watermark: null,
};

// ---------- Product ad (9:16) ----------

/** Closing card: product photo, name, price and the call to action. */
export type EndCard = { name: string; price: string | null; cta: string; imageUrl: string | null; accentColor: string };

/** Same timing model as the long video, vertical, plus an end card after the voice. */
export type AdProps = VideoProps & {
  endCard: EndCard;
  /** Frame where the end card starts (= end of the voice). */
  endCardFromFrame: number;
  /** No voiceover: lines are shown as big kinetic text instead of captions. */
  silent: boolean;
};

export const EMPTY_AD: AdProps = {
  ...EMPTY_VIDEO,
  width: 1080,
  height: 1920,
  showCaptions: true,
  paperColor: "#18181B",
  textColor: "#FFFFFF",
  fontKey: "montserrat",
  endCard: { name: "", price: null, cta: "", imageUrl: null, accentColor: "#E11D48" },
  endCardFromFrame: 30,
  silent: false,
};
