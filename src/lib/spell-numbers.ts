/**
 * Turn digits in a narration script into words, so a text-to-speech voice reads them naturally
 * and the captions match what is heard. Only Vietnamese is converted; other languages pass through.
 *
 *   "76 tuổi"   → "bảy mươi sáu tuổi"
 *   "1,2 tỷ"    → "một tỷ hai trăm triệu"
 *   "1.500.000" → "một triệu năm trăm nghìn"
 *   "30%"       → "ba mươi phần trăm"
 */
export function spellOutNumbers(text: string, language?: string): string {
  if (!(language ?? "").toLowerCase().startsWith("vi")) return text;
  return (
    text
      // decimal + money unit: "1,2 tỷ", "2,5 triệu" → whole unit + the remainder in the next unit down
      .replace(/(\d+),(\d{1,3})\s+(tỷ|triệu|nghìn|ngàn)/g, (_, whole: string, frac: string, unit: string) => {
        const down = DOWN[unit as keyof typeof DOWN];
        const rest = Number(frac.padEnd(3, "0"));
        return `${viInteger(Number(whole))} ${unit}${rest ? ` ${viInteger(rest)} ${down}` : ""}`;
      })
      // percentages
      .replace(/(\d+(?:,\d+)?)\s*%/g, (_, n: string) => `${viDecimal(n)} phần trăm`)
      // integers with Vietnamese thousands dots ("1.500.000") or plain integers, and decimals with a comma
      .replace(/\d{1,3}(?:\.\d{3})+(?!\d)|\d+(?:,\d+)?/g, (m) => (m.includes(".") ? viInteger(Number(m.replace(/\./g, ""))) : viDecimal(m)))
  );
}

const DOWN = { tỷ: "triệu", triệu: "nghìn", nghìn: "", ngàn: "" } as const;
const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const GROUPS = ["", "nghìn", "triệu", "tỷ"];

function viDecimal(s: string): string {
  const [whole, frac] = s.split(",");
  if (!frac) return viInteger(Number(whole));
  // Leading zeros after the comma are read one by one ("0,05" → "không phẩy không năm").
  const zeros = frac.match(/^0*/)?.[0].length ?? 0;
  const rest = frac.slice(zeros);
  return `${viInteger(Number(whole))} phẩy ${[...Array(zeros).fill("không"), ...(rest ? [viInteger(Number(rest))] : [])].join(" ")}`;
}

/** Read a non-negative integer in Vietnamese (up to the nghìn tỷ range). */
export function viInteger(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n === 0) return "không";
  if (n >= 1e12) {
    const high = Math.floor(n / 1e9);
    const low = n % 1e9;
    return [`${viInteger(high)} tỷ`, low ? groupsToWords(low, true) : ""].filter(Boolean).join(" ");
  }
  return groupsToWords(n, false);
}

function groupsToWords(n: number, padded: boolean): string {
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const full = padded || i < groups.length - 1; // a group after a higher one reads its zero hundreds ("không trăm")
    parts.push(`${read3(g, full)}${GROUPS[i] ? ` ${GROUPS[i]}` : ""}`);
  }
  return parts.join(" ");
}

function read3(n: number, full: boolean): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const out: string[] = [];
  if (h > 0 || full) out.push(`${DIGITS[h]} trăm`);
  if (t === 0) {
    if (u > 0 && out.length) out.push("lẻ");
    if (u > 0) out.push(DIGITS[u]);
  } else if (t === 1) {
    out.push("mười");
    if (u === 5) out.push("lăm");
    else if (u > 0) out.push(DIGITS[u]);
  } else {
    out.push(`${DIGITS[t]} mươi`);
    if (u === 1) out.push("mốt");
    else if (u === 4) out.push("tư");
    else if (u === 5) out.push("lăm");
    else if (u > 0) out.push(DIGITS[u]);
  }
  return out.join(" ");
}
