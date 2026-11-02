import React from "react";
import { AbsoluteFill, Html5Audio, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AdProps, EndCard, VideoCaption, VideoScene } from "./types";
import { Placeholder, TextFrame, handFont, useFadeIn } from "./shared";
import type { FontKey } from "../lib/languages";
import { Watermark, cornerBox } from "./Watermark";
import { readableOn } from "../lib/color";

/** Stronger push-in than the long video's drift: ads need motion in every shot. */
function AdImage({ src, index, durationInFrames, enabled }: { src: string; index: number; durationInFrames: number; enabled: boolean }) {
  const frame = useCurrentFrame();
  const p = Math.min(1, frame / Math.max(1, durationInFrames));
  const zoomIn = index % 2 === 0;
  const scale = enabled ? (zoomIn ? 1.02 + 0.1 * p : 1.12 - 0.1 * p) : 1;
  const dy = enabled ? (index % 3 === 1 ? -20 * p : index % 3 === 2 ? 20 * p : 0) : 0;
  return (
    <Img
      src={src}
      style={{ width: "100%", height: "100%", objectFit: "cover", transformOrigin: "50% 40%", transform: `scale(${scale}) translateY(${dy}px)` }}
    />
  );
}

function Punch({ text, font }: { text: string; font: FontKey }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 180 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 220 }}>
      <div
        style={{
          fontFamily: handFont(font),
          fontSize: text.length < 14 ? 104 : 76,
          color: "#fff",
          WebkitTextStroke: "8px #111",
          paintOrder: "stroke fill",
          textAlign: "center",
          maxWidth: 940,
          lineHeight: 1.05,
          transform: `scale(${0.6 + 0.4 * pop})`,
          opacity: pop,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}

function SceneLayer({ scene, index, props }: { scene: VideoScene; index: number; props: AdProps }) {
  const opacity = useFadeIn(index, props.crossfadeFrames);
  if (scene.textOnly) {
    return (
      <AbsoluteFill style={{ opacity }}>
        <TextFrame text={scene.onScreenText ?? ""} color={props.textColor} paper={props.paperColor} font={props.fontKey} width={1080} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ opacity, background: scene.bgColor }}>
      {scene.imageUrl ? <AdImage src={scene.imageUrl} index={index} durationInFrames={scene.durationInFrames} enabled={props.kenBurns} /> : <Placeholder />}
      {/* Silent ads put big text over the middle of the image: dim it a little so the words read. */}
      {props.silent && props.showCaptions ? <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.38), rgba(0,0,0,0.12) 70%)" }} /> : null}
      {/* Silent ads already show their line as big text; a second punch line would compete with it. */}
      {scene.onScreenText && !(props.silent && props.showCaptions) ? <Punch text={scene.onScreenText} font={props.fontKey} /> : null}
    </AbsoluteFill>
  );
}

/**
 * Sentence caption with the current word highlighted. Only sentence times are known, so word times
 * are spread across the sentence by word length (close enough at ad speed).
 */
function Caption({ caption, accent, font }: { caption: VideoCaption; accent: string; font: FontKey }) {
  const frame = useCurrentFrame();
  const words = caption.text.split(/\s+/).filter(Boolean);
  const total = Math.max(1, caption.toFrame - caption.fromFrame);
  const weights = words.map((w) => w.length + 2);
  const sum = weights.reduce((a, b) => a + b, 0);
  const ends: number[] = [];
  for (const w of weights) ends.push((ends.at(-1) ?? 0) + w);
  const current = ends.findIndex((end) => frame < (end / sum) * total);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 300, paddingLeft: 70, paddingRight: 70 }}>
      <div
        style={{
          fontFamily: handFont(font),
          fontSize: 68,
          lineHeight: 1.18,
          textAlign: "center",
          color: "#fff",
          WebkitTextStroke: "10px #000",
          paintOrder: "stroke fill",
          textTransform: "uppercase",
        }}
      >
        {words.map((w, i) => (
          <span key={i} style={{ color: i === (current < 0 ? words.length - 1 : current) ? accent : "#fff" }}>
            {w}
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
}

/** Silent ads: the line itself is the message. Big centered words popping in one by one. */
function KineticLine({ caption, accent, font }: { caption: VideoCaption; accent: string; font: FontKey }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = caption.text.split(/\s+/).filter(Boolean);
  const total = Math.max(1, caption.toFrame - caption.fromFrame);
  // Every word is in by 60% of the line's time, so the full line can be read before it goes.
  const step = (total * 0.6) / Math.max(1, words.length);
  const out = interpolate(frame, [total - 6, total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const size = caption.text.length < 24 ? 108 : caption.text.length < 48 ? 88 : 70;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 70px", opacity: out }}>
      <div style={{ fontFamily: handFont(font), fontSize: size, lineHeight: 1.08, textAlign: "center", textTransform: "uppercase" }}>
        {words.map((w, i) => {
          const pop = spring({ frame: frame - i * step, fps, config: { damping: 11, stiffness: 200 } });
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                margin: "0 0.14em",
                color: i === words.length - 1 ? accent : "#fff",
                WebkitTextStroke: "12px #000",
                paintOrder: "stroke fill",
                opacity: Math.min(1, pop * 1.5),
                transform: `translateY(${(1 - pop) * 40}px) scale(${0.7 + 0.3 * pop})`,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function EndCardLayer({ card, paper, font }: { card: EndCard; paper: string; font: FontKey }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ink = readableOn(paper);
  const inP = spring({ frame, fps, config: { damping: 14 } });
  const cta = spring({ frame: frame - 10, fps, config: { damping: 10, stiffness: 160 } });
  const pulse = 1 + 0.03 * Math.sin((frame / fps) * Math.PI * 2);
  return (
    <AbsoluteFill style={{ background: paper, alignItems: "center", justifyContent: "center", gap: 48, padding: 80, opacity: interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" }) }}>
      {card.imageUrl ? (
        <Img
          src={card.imageUrl}
          style={{ width: 760, height: 760, objectFit: "contain", transform: `scale(${0.85 + 0.15 * inP})`, filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.35))" }}
        />
      ) : null}
      <div style={{ fontFamily: handFont(font), color: ink, fontSize: card.name.length < 18 ? 92 : 68, textAlign: "center", lineHeight: 1.05 }}>{card.name}</div>
      {card.price ? <div style={{ fontFamily: handFont(font), color: card.accentColor, fontSize: 80 }}>{card.price}</div> : null}
      <div
        style={{
          fontFamily: handFont(font),
          background: card.accentColor,
          color: readableOn(card.accentColor),
          fontSize: 58,
          padding: "26px 56px",
          borderRadius: 999,
          textAlign: "center",
          maxWidth: 920,
          transform: `scale(${Math.max(0, cta) * pulse})`,
        }}
      >
        {card.cta}
      </div>
    </AbsoluteFill>
  );
}

export const ProductAd: React.FC<AdProps> = (props) => {
  return (
    <AbsoluteFill style={{ background: props.paperColor }}>
      {props.scenes.map((s, i) => (
        // Every scene runs `crossfade` frames long so the next scene (or the end card) fades in over it.
        // Mount (and decode the image) a second early so the cut doesn't stall the preview.
        <Sequence key={s.id} from={s.fromFrame} durationInFrames={s.durationInFrames + props.crossfadeFrames} premountFor={props.fps}>
          <SceneLayer scene={s} index={i} props={props} />
        </Sequence>
      ))}
      {props.showCaptions
        ? props.captions.map((c, i) => (
            <Sequence key={i} from={c.fromFrame} durationInFrames={Math.max(1, c.toFrame - c.fromFrame)} layout="none">
              {props.silent ? (
                <KineticLine caption={{ ...c, fromFrame: 0, toFrame: c.toFrame - c.fromFrame }} accent={props.endCard.accentColor} font={props.fontKey} />
              ) : (
                <Caption caption={{ ...c, fromFrame: 0, toFrame: c.toFrame - c.fromFrame }} accent={props.endCard.accentColor} font={props.fontKey} />
              )}
            </Sequence>
          ))
        : null}
      <Sequence from={props.endCardFromFrame} layout="none">
        <EndCardLayer card={props.endCard} paper={props.paperColor} font={props.fontKey} />
      </Sequence>
      {props.watermark ? <Watermark mark={props.watermark} box={cornerBox("top-right", 60)} /> : null}
      {props.audioUrl ? <Html5Audio src={props.audioUrl} playbackRate={props.playbackRate} /> : null}
    </AbsoluteFill>
  );
};
