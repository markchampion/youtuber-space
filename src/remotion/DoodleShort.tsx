import React from "react";
import { AbsoluteFill, Html5Audio, Sequence, interpolate, useCurrentFrame } from "remotion";
import type { ShortProps, ShortScene } from "./types";
import { KenBurnsImage, Placeholder, TextFrame, handFont, useFadeIn } from "./shared";
import { Watermark } from "./Watermark";
import { contrastRatio, outlineFor, readableOn } from "../lib/color";

// Stacked layout geometry (1080×1920): hook title on top, the 16:9 image in the middle, captions below.
const IMAGE_TOP = 640;
const IMAGE_H = 608; // 1080 × 9/16

function SceneVisual({ scene, index, props, vertical }: { scene: ShortScene; index: number; props: ShortProps; vertical: boolean }) {
  const opacity = useFadeIn(index, props.crossfadeFrames);
  const src = vertical ? scene.verticalImageUrl ?? scene.imageUrl : scene.imageUrl;
  return (
    <AbsoluteFill style={{ opacity, background: scene.textOnly ? props.paperColor : scene.bgColor }}>
      {scene.textOnly ? (
        <TextFrame text={scene.onScreenText ?? ""} color={props.textColor} paper={props.paperColor} font={props.fontKey} width={1080} />
      ) : src ? (
        <KenBurnsImage src={src} index={index} durationInFrames={scene.durationInFrames} enabled shots={scene.shots} />
      ) : (
        <Placeholder />
      )}
    </AbsoluteFill>
  );
}

function Scenes({ props, vertical }: { props: ShortProps; vertical: boolean }) {
  const last = props.scenes.length - 1;
  return (
    <>
      {props.scenes.map((s, i) => (
        // Mount (and decode the image) a second early so the cut doesn't stall the preview.
        <Sequence key={s.id} from={s.fromFrame} durationInFrames={s.durationInFrames + (i < last ? props.crossfadeFrames : 0)} premountFor={props.fps}>
          <SceneVisual scene={s} index={i} props={props} vertical={vertical} />
        </Sequence>
      ))}
    </>
  );
}

function Captions({ props, top, onImage }: { props: ShortProps; top: number; onImage: boolean }) {
  return (
    <>
      {props.captions.map((c, i) => (
        <Sequence key={i} from={c.fromFrame} durationInFrames={Math.max(1, c.toFrame - c.fromFrame)} layout="none">
          <div style={{ position: "absolute", left: 60, right: 60, top, display: "flex", justifyContent: "center" }}>
            <div
              style={{
                fontFamily: "Helvetica, Arial, sans-serif",
                fontWeight: 800,
                fontSize: 84,
                lineHeight: 1.15,
                textAlign: "center",
                color: onImage ? "#FFFFFF" : props.captionColor,
                // On the paper, a thin outline in the opposite tone keeps any chosen color crisp.
                WebkitTextStroke: onImage ? "12px #111" : `6px ${readableOn(props.captionColor)}`,
                paintOrder: "stroke fill",
              }}
            >
              {c.text}
            </div>
          </div>
        </Sequence>
      ))}
    </>
  );
}

function Title({ props, top, onImage }: { props: ShortProps; top: number; onImage: boolean }) {
  if (!props.title) return null;
  // A text color that vanishes on the paper falls back to one that reads.
  const color = onImage || contrastRatio(props.textColor, props.paperColor) >= 3 ? props.textColor : readableOn(props.paperColor);
  return (
    <div style={{ position: "absolute", left: 70, right: 70, top, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: handFont(props.fontKey),
          fontSize: props.title.length < 28 ? 96 : 76,
          lineHeight: 1.1,
          textAlign: "center",
          color,
          WebkitTextStroke: onImage ? `10px ${outlineFor(color)}` : undefined,
          paintOrder: "stroke fill",
          transform: "rotate(-1.5deg)",
        }}
      >
        {props.title}
      </div>
    </div>
  );
}

/** Small "PART 2/10" pill above the title of a series part. */
function PartLabel({ props, top }: { props: ShortProps; top: number }) {
  if (!props.partLabel) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: handFont(props.fontKey),
          fontSize: 44,
          letterSpacing: 2,
          padding: "10px 28px",
          borderRadius: 999,
          background: props.textColor,
          color: readableOn(props.textColor),
        }}
      >
        {props.partLabel}
      </div>
    </div>
  );
}

const END_NOTE_FRAMES = 75; // last ~2.5 s

function EndNoteInner({ props, top }: { props: ShortProps; top: number }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const lift = interpolate(frame, [0, 8], [20, 0], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top, display: "flex", justifyContent: "center", opacity, transform: `translateY(${lift}px)` }}>
      <div
        style={{
          fontFamily: handFont(props.fontKey),
          fontSize: 60,
          padding: "16px 40px",
          borderRadius: 999,
          background: props.textColor,
          color: readableOn(props.textColor),
          boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
        }}
      >
        {props.endNote}
      </div>
    </div>
  );
}

/** "Part 3 next →" (or "Full video on the channel") during the last seconds of a series part. */
function EndNote({ props, top }: { props: ShortProps; top: number }) {
  if (!props.endNote) return null;
  const from = Math.max(0, props.durationInFrames - END_NOTE_FRAMES);
  return (
    <Sequence from={from} durationInFrames={props.durationInFrames - from} layout="none">
      <EndNoteInner props={props} top={top} />
    </Sequence>
  );
}

// Shorts ignore the corner setting: top-left below the status bar stays clear of the
// TikTok/Reels right-hand buttons, the bottom caption area and our hook title.
function ShortMark({ props }: { props: ShortProps }) {
  if (!props.watermark) return null;
  return <Watermark mark={{ ...props.watermark, position: "top-left" }} box={{ top: 96, left: 56 }} size={1.15} />;
}

export const DoodleShort: React.FC<ShortProps> = (props) => {
  const audio = props.audioUrl ? (
    <Html5Audio src={props.audioUrl} trimBefore={props.audioTrimBefore} trimAfter={props.audioTrimAfter} playbackRate={props.playbackRate} />
  ) : null;

  if (props.layout === "fullscreen") {
    return (
      <AbsoluteFill style={{ background: props.paperColor }}>
        <Scenes props={props} vertical />
        <PartLabel props={props} top={90} />
        <Title props={props} top={180} onImage />
        {/* Captions sit above the bottom UI of TikTok/Reels/Shorts. */}
        <Captions props={props} top={1180} onImage />
        <EndNote props={props} top={1440} />
        <ShortMark props={props} />
        {audio}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ background: props.paperColor }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: IMAGE_TOP, display: "flex", alignItems: "center" }}>
        <Title props={props} top={220} onImage={false} />
      </div>
      <div style={{ position: "absolute", left: 0, top: IMAGE_TOP, width: 1080, height: IMAGE_H, overflow: "hidden" }}>
        <Scenes props={props} vertical={false} />
      </div>
      <PartLabel props={props} top={110} />
      <Captions props={props} top={IMAGE_TOP + IMAGE_H + 120} onImage={false} />
      <EndNote props={props} top={1640} />
      <ShortMark props={props} />
      {audio}
    </AbsoluteFill>
  );
};
