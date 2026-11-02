import React from "react";
import { Composition } from "remotion";
import { DoodleVideo } from "./DoodleVideo";
import { DoodleShort } from "./DoodleShort";
import { ProductAd } from "./ProductAd";
import { EMPTY_AD, EMPTY_SHORT, EMPTY_VIDEO, type AdProps, type ShortProps, type VideoProps } from "./types";

export const COMPOSITION_ID = "DoodleVideo";
export const AD_COMPOSITION_ID = "ProductAd";

const fromProps = ({ props }: { props: VideoProps | ShortProps | AdProps }) => ({
  durationInFrames: Math.max(1, props.durationInFrames),
  fps: props.fps,
  width: props.width,
  height: props.height,
});

export const RemotionRoot: React.FC = () => (
  <>
    {/* 16:9 long video */}
    <Composition
      id={COMPOSITION_ID}
      component={DoodleVideo}
      defaultProps={EMPTY_VIDEO}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={30}
      calculateMetadata={fromProps}
    />
    {/* 9:16 Short cut from the long video */}
    <Composition
      id="DoodleShort"
      component={DoodleShort}
      defaultProps={EMPTY_SHORT}
      fps={30}
      width={1080}
      height={1920}
      durationInFrames={30}
      calculateMetadata={fromProps}
    />
    {/* 9:16 product ad: AI product scenes + voice + end card */}
    <Composition
      id={AD_COMPOSITION_ID}
      component={ProductAd}
      defaultProps={EMPTY_AD}
      fps={30}
      width={1080}
      height={1920}
      durationInFrames={30}
      calculateMetadata={fromProps}
    />
  </>
);
