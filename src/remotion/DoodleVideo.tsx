import React from "react";
import { AbsoluteFill, Html5Audio, Sequence } from "remotion";
import type { VideoProps, VideoScene } from "./types";
import { KenBurnsImage, Placeholder, TextFrame, handFont, useFadeIn } from "./shared";
import type { FontKey } from "../lib/languages";
import { Watermark, cornerBox } from "./Watermark";
import { outlineFor } from "../lib/color";

function Overlay({ text, placement, color, font }: { text: string; placement: "center" | "top"; color: string; font: FontKey }) {
  const onObject = placement === "center";
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: onObject ? "center" : "flex-start",
        paddingTop: onObject ? 0 : 70,
      }}
    >
      <div
        style={{
          fontFamily: handFont(font),
          fontSize: text.length < 16 ? 120 : 84,
          color: onObject ? "#FFFFFF" : color,
          WebkitTextStroke: onObject ? "6px #111" : `6px ${outlineFor(color)}`,
          paintOrder: "stroke fill",
          textAlign: "center",
          maxWidth: 1600,
          transform: "rotate(-1deg)",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}

function SceneLayer({ scene, index, props }: { scene: VideoScene; index: number; props: VideoProps }) {
  const opacity = useFadeIn(index, props.crossfadeFrames);
  if (scene.textOnly) {
    return (
      <AbsoluteFill style={{ opacity }}>
        <TextFrame text={scene.onScreenText ?? ""} color={props.textColor} paper={props.paperColor} font={props.fontKey} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ opacity, background: scene.bgColor }}>
      {scene.imageUrl ? (
        <KenBurnsImage src={scene.imageUrl} index={index} durationInFrames={scene.durationInFrames} enabled={props.kenBurns} shots={scene.shots} />
      ) : (
        <Placeholder />
      )}
      {scene.onScreenText ? <Overlay text={scene.onScreenText} placement={scene.textPlacement} color={props.textColor} font={props.fontKey} /> : null}
    </AbsoluteFill>
  );
}

export const DoodleVideo: React.FC<VideoProps> = (props) => {
  const last = props.scenes.length - 1;
  return (
    <AbsoluteFill style={{ background: props.paperColor }}>
      {props.scenes.map((s, i) => (
        // Each scene extends `crossfade` frames into the next one so the next can fade in over it.
        <Sequence
          key={s.id}
          from={s.fromFrame}
          durationInFrames={s.durationInFrames + (i < last ? props.crossfadeFrames : 0)}
          // Mount (and decode the image) a second early so the cut doesn't stall the preview.
          premountFor={props.fps}
        >
          <SceneLayer scene={s} index={i} props={props} />
        </Sequence>
      ))}
      {/* Above the scenes, below captions. A bottom mark moves up when captions are on so they never overlap. */}
      {props.watermark ? (
        <Watermark
          mark={props.watermark}
          box={{
            ...cornerBox(props.watermark.position, 48),
            // Two-line captions reach ~230 px from the bottom; sit above them.
            ...(props.watermark.position.startsWith("bottom") && props.showCaptions ? { bottom: 250 } : {}),
          }}
        />
      ) : null}
      {props.showCaptions
        ? props.captions.map((c, i) => (
            <Sequence key={i} from={c.fromFrame} durationInFrames={Math.max(1, c.toFrame - c.fromFrame)} layout="none">
              <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 60 }}>
                <div
                  style={{
                    background: "rgba(0,0,0,0.72)",
                    color: "#fff",
                    fontFamily: "Helvetica, Arial, sans-serif",
                    fontSize: 44,
                    fontWeight: 600,
                    padding: "12px 28px",
                    borderRadius: 14,
                    maxWidth: 1500,
                    textAlign: "center",
                    lineHeight: 1.25,
                  }}
                >
                  {c.text}
                </div>
              </AbsoluteFill>
            </Sequence>
          ))
        : null}
      {props.audioUrl ? <Html5Audio src={props.audioUrl} playbackRate={props.playbackRate} /> : null}
    </AbsoluteFill>
  );
};
