import { describe, expect, it } from "vitest";
import { contrastRatio, luminance, outlineFor, readableOn } from "./color";

describe("readable colors", () => {
  it("picks white on dark paper and dark ink on light paper", () => {
    expect(readableOn("#0F1420")).toBe("#FFFFFF");
    expect(readableOn("#F5F1E6")).toBe("#1C1917");
  });

  it("measures contrast the WCAG way", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
    expect(contrastRatio("#FFFFFF", "#0F1420")).toBeGreaterThan(4.5);
    expect(contrastRatio("#1C1917", "#0F1420")).toBeLessThan(3);
  });

  it("outlines light text in dark and colored text in white", () => {
    expect(outlineFor("#F2EDE4")).toBe("#1C1917");
    expect(outlineFor("#E0302B")).toBe("#FFFFFF");
  });

  it("treats bad input as light", () => {
    expect(luminance("blue")).toBe(1);
  });
});
