import { describe, expect, it } from "vitest";
import { spellOutNumbers, viInteger } from "./spell-numbers";

describe("viInteger", () => {
  it.each([
    [0, "không"],
    [5, "năm"],
    [10, "mười"],
    [15, "mười lăm"],
    [21, "hai mươi mốt"],
    [24, "hai mươi tư"],
    [76, "bảy mươi sáu"],
    [105, "một trăm lẻ năm"],
    [1983, "một nghìn chín trăm tám mươi ba"],
    [2005, "hai nghìn không trăm lẻ năm"],
    [1_200_000_000, "một tỷ hai trăm triệu"],
    [9_000_000_000, "chín tỷ"],
    [40_000_000, "bốn mươi triệu"],
  ])("%d → %s", (n, words) => expect(viInteger(n)).toBe(words));
});

describe("spellOutNumbers", () => {
  it("reads ages, money with units, dotted thousands and percentages", () => {
    expect(spellOutNumbers("Ông 76 tuổi, có 1,2 tỷ và 1.500.000 đồng, lãi 30%.", "vi")).toBe(
      "Ông bảy mươi sáu tuổi, có một tỷ hai trăm triệu và một triệu năm trăm nghìn đồng, lãi ba mươi phần trăm.",
    );
  });
  it("keeps words untouched", () => {
    const s = "Bố mẹ dọn xuống gầm cầu thang mà ngủ.";
    expect(spellOutNumbers(s, "vi")).toBe(s);
  });
  it("leaves other languages alone", () => {
    expect(spellOutNumbers("He was 76.", "en")).toBe("He was 76.");
  });
});
