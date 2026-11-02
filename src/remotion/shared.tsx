import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadMarker } from "@remotion/google-fonts/PermanentMarker";
import { loadFont as loadPangolin } from "@remotion/google-fonts/Pangolin";
import { loadFont as loadItim } from "@remotion/google-fonts/Itim";
import { loadFont as loadKalam } from "@remotion/google-fonts/Kalam";
import { loadFont as loadYusei } from "@remotion/google-fonts/YuseiMagic";
import { loadFont as loadZcool } from "@remotion/google-fonts/ZCOOLKuaiLe";
import { loadFont as loadGamja } from "@remotion/google-fonts/GamjaFlower";
import { loadFont as loadPatrickHand } from "@remotion/google-fonts/PatrickHand";
import { loadFont as loadCaveat } from "@remotion/google-fonts/Caveat";
import { loadFont as loadBangers } from "@remotion/google-fonts/Bangers";
import { loadFont as loadBebas } from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadArchivoBlack } from "@remotion/google-fonts/ArchivoBlack";
import { loadFont as loadCinzel } from "@remotion/google-fonts/Cinzel";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadSpecialElite } from "@remotion/google-fonts/SpecialElite";
import { loadFont as loadRobotoSlab } from "@remotion/google-fonts/RobotoSlab";
import type { FontKey } from "../lib/languages";
import type { Shot } from "./types";

// Language fonts plus the on-screen fonts a channel can pick. Each is loaded only when a video actually uses it.
// Only one (bold) weight is loaded, so the browser uses it for normal text too.
const LOADERS: Record<FontKey, () => { fontFamily: string }> = {
  marker: () => loadMarker("normal", { weights: ["400"], subsets: ["latin"] }),
  pangolin: () => loadPangolin("normal", { weights: ["400"], subsets: ["latin", "latin-ext", "vietnamese", "cyrillic"] }),
  itim: () => loadItim("normal", { weights: ["400"], subsets: ["latin", "thai", "vietnamese"] }),
  kalam: () => loadKalam("normal", { weights: ["400"], subsets: ["latin", "devanagari"] }),
  yusei: () => loadYusei("normal", { weights: ["400"], subsets: ["latin", "japanese"] }),
  zcool: () => loadZcool("normal", { weights: ["400"], subsets: ["latin", "chinese-simplified"] }),
  gamja: () => loadGamja("normal", { weights: ["400"], subsets: ["latin", "korean"] }),
  patrickHand: () => loadPatrickHand("normal", { weights: ["400"], subsets: ["latin", "latin-ext", "vietnamese"] }),
  caveat: () => loadCaveat("normal", { weights: ["700"], subsets: ["latin", "latin-ext", "cyrillic"] }),
  bangers: () => loadBangers("normal", { weights: ["400"], subsets: ["latin", "latin-ext", "vietnamese"] }),
  bebas: () => loadBebas("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] }),
  anton: () => loadAnton("normal", { weights: ["400"], subsets: ["latin", "latin-ext", "vietnamese"] }),
  oswald: () => loadOswald("normal", { weights: ["600"], subsets: ["latin", "latin-ext", "vietnamese", "cyrillic"] }),
  montserrat: () => loadMontserrat("normal", { weights: ["800"], subsets: ["latin", "latin-ext", "vietnamese", "cyrillic"] }),
  archivoBlack: () => loadArchivoBlack("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] }),
  cinzel: () => loadCinzel("normal", { weights: ["700"], subsets: ["latin", "latin-ext"] }),
  playfair: () => loadPlayfair("normal", { weights: ["700"], subsets: ["latin", "latin-ext", "vietnamese", "cyrillic"] }),
  specialElite: () => loadSpecialElite("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] }),
  robotoSlab: () => loadRobotoSlab("normal", { weights: ["700"], subsets: ["latin", "latin-ext", "vietnamese", "cyrillic"] }),
};
const loaded = new Map<FontKey, string>();

/** CSS font-family for a channel's on-screen font (falls back to a rounded system font). */
export function handFont(key: FontKey = "marker") {
  let family = loaded.get(key);
  if (!family) {
    family = (LOADERS[key] ?? LOADERS.marker)().fontFamily;
    loaded.set(key, family);
  }
  return `${family}, "Arial Rounded MT Bold", sans-serif`;
}

/** Big hand-lettered key phrase on the channel's paper color. */
export function TextFrame({ text, color, paper, font, width = 1920 }: { text: string; color: string; paper: string; font: FontKey; width?: number }) {
  const frame = useCurrentFrame();
  const pop = interpolate(frame, [0, 8], [0.92, 1], { extrapolateRight: "clamp" });
  const len = text.length;
  const k = width / 1920;
  const size = (len < 12 ? 190 : len < 24 ? 140 : len < 40 ? 104 : 80) * Math.max(k, 0.75);
  return (
    <AbsoluteFill style={{ background: paper, alignItems: "center", justifyContent: "center", padding: 140 * k }}>
      <div style={{ fontFamily: handFont(font), color, fontSize: size, lineHeight: 1.1, textAlign: "center", transform: `scale(${pop}) rotate(-1.2deg)` }}>
        {text}
      </div>
    </AbsoluteFill>
  );
}

// Camera cuts: which part of the image each framing shows (zoom + focus point).
const FRAMINGS: Record<Shot["framing"], { zoom: number; origin: string }> = {
  wide: { zoom: 1, origin: "50% 50%" },
  left: { zoom: 1.28, origin: "22% 50%" },
  right: { zoom: 1.28, origin: "78% 50%" },
  center: { zoom: 1.35, origin: "50% 42%" },
};

/**
 * Scene image. Each shot is a hard cut to a new framing of the same image (so the picture changes
 * at every sentence without generating more images), with a gentle drift inside the shot.
 */
export function KenBurnsImage({
  src,
  index,
  durationInFrames,
  enabled,
  shots = [{ fromFrame: 0, framing: "wide" }],
}: {
  src: string;
  index: number;
  durationInFrames: number;
  enabled: boolean;
  shots?: Shot[];
}) {
  const frame = useCurrentFrame();
  let k = 0;
  for (let i = 0; i < shots.length; i++) if (shots[i].fromFrame <= frame) k = i;
  const shot = shots[k];
  const shotEnd = shots[k + 1]?.fromFrame ?? durationInFrames;
  const p = Math.min(1, (frame - shot.fromFrame) / Math.max(1, shotEnd - shot.fromFrame));
  const f = FRAMINGS[shot.framing];
  // Gentle: at most 3% extra zoom and a small drift, so edges (heads, feet, props) stay in frame.
  const zoomIn = (index + k) % 2 === 0;
  const drift = enabled ? (zoomIn ? 0.03 * p : 0.03 - 0.03 * p) : 0;
  const dx = enabled ? ((index + k) % 3 === 0 ? -1 : (index + k) % 3 === 1 ? 1 : 0) * 8 * p : 0;
  return (
    <Img
      src={src}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        transformOrigin: f.origin,
        transform: `scale(${f.zoom + drift}) translateX(${dx}px)`,
      }}
    />
  );
}

export function Placeholder() {
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: handFont("marker"), fontSize: 72, color: "rgba(0,0,0,0.35)" }}>image pending</div>
    </AbsoluteFill>
  );
}

/** Fade a scene in over the previous one. */
export function useFadeIn(index: number, crossfadeFrames: number) {
  const frame = useCurrentFrame();
  return index === 0 || crossfadeFrames <= 0 ? 1 : interpolate(frame, [0, crossfadeFrames], [0, 1], { extrapolateRight: "clamp" });
}
