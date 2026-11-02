import React from "react";
import { Img } from "remotion";
import type { WatermarkProps } from "./types";

/**
 * Small channel mark: optional logo + handle, with a soft shadow so it reads on light and dark images.
 * `box` is where to place it; `size` scales everything (1 = long video).
 */
export function Watermark({ mark, box, size = 1 }: { mark: WatermarkProps; box: React.CSSProperties; size?: number }) {
  const right = mark.position.endsWith("right");
  return (
    <div
      style={{
        position: "absolute",
        ...box,
        display: "flex",
        flexDirection: right ? "row-reverse" : "row",
        alignItems: "center",
        gap: 14 * size,
        opacity: mark.opacity,
        pointerEvents: "none",
      }}
    >
      {mark.logoUrl ? (
        <Img src={mark.logoUrl} style={{ height: 72 * size, width: "auto", filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))" }} />
      ) : null}
      {mark.text ? (
        <div
          style={{
            fontFamily: "Helvetica, Arial, sans-serif",
            fontWeight: 800,
            fontSize: 34 * size,
            color: "#FFFFFF",
            letterSpacing: 0.5,
            textShadow: "0 2px 8px rgba(0,0,0,0.65), 0 0 2px rgba(0,0,0,0.8)",
            whiteSpace: "nowrap",
          }}
        >
          {mark.text}
        </div>
      ) : null}
    </div>
  );
}

/** Absolute placement for a corner with a margin. */
export function cornerBox(position: WatermarkProps["position"], margin: number): React.CSSProperties {
  return {
    [position.startsWith("top") ? "top" : "bottom"]: margin,
    [position.endsWith("left") ? "left" : "right"]: margin,
  };
}
