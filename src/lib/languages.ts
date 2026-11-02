// Channel languages. Shared by the server (prompts, sentence splitting) and the client/Remotion (fonts, UI).

/** Language fonts (hand-drawn, one per script) plus the extra on-screen fonts a channel can pick. */
export type FontKey =
  | "marker"
  | "pangolin"
  | "itim"
  | "kalam"
  | "yusei"
  | "zcool"
  | "gamja"
  | "patrickHand"
  | "caveat"
  | "bangers"
  | "bebas"
  | "anton"
  | "oswald"
  | "montserrat"
  | "archivoBlack"
  | "cinzel"
  | "playfair"
  | "specialElite"
  | "robotoSlab";

/** Which alphabet a language needs from a font. */
export type Script = "latin" | "vietnamese" | "cyrillic" | "other";

export type FontOption = { key: FontKey; label: string; group: "Hand-drawn" | "Bold / clean" | "Cinematic / serif"; scripts: Script[] };

/** Fonts a channel can choose for on-screen text. Scripts come from each font's Google Fonts subsets. */
export const FONT_OPTIONS: FontOption[] = [
  { key: "marker", label: "Permanent Marker", group: "Hand-drawn", scripts: ["latin"] },
  { key: "patrickHand", label: "Patrick Hand", group: "Hand-drawn", scripts: ["latin", "vietnamese"] },
  { key: "caveat", label: "Caveat", group: "Hand-drawn", scripts: ["latin", "cyrillic"] },
  { key: "bangers", label: "Bangers (comic)", group: "Hand-drawn", scripts: ["latin", "vietnamese"] },
  { key: "bebas", label: "Bebas Neue", group: "Bold / clean", scripts: ["latin"] },
  { key: "anton", label: "Anton", group: "Bold / clean", scripts: ["latin", "vietnamese"] },
  { key: "oswald", label: "Oswald", group: "Bold / clean", scripts: ["latin", "vietnamese", "cyrillic"] },
  { key: "montserrat", label: "Montserrat (extra bold)", group: "Bold / clean", scripts: ["latin", "vietnamese", "cyrillic"] },
  { key: "archivoBlack", label: "Archivo Black", group: "Bold / clean", scripts: ["latin"] },
  { key: "cinzel", label: "Cinzel", group: "Cinematic / serif", scripts: ["latin"] },
  { key: "playfair", label: "Playfair Display", group: "Cinematic / serif", scripts: ["latin", "vietnamese", "cyrillic"] },
  { key: "specialElite", label: "Special Elite (typewriter)", group: "Cinematic / serif", scripts: ["latin"] },
  { key: "robotoSlab", label: "Roboto Slab", group: "Cinematic / serif", scripts: ["latin", "vietnamese", "cyrillic"] },
];

const LATIN = ["en", "es", "pt", "fr", "de", "it", "id"];

export function scriptOf(code: string | null | undefined): Script {
  const c = getLanguage(code).code;
  if (LATIN.includes(c)) return "latin";
  if (c === "vi") return "vietnamese";
  if (c === "ru") return "cyrillic";
  return "other";
}

/** Whether a font can show every character of the language. */
export function fontSupports(font: FontKey, language: string | null | undefined) {
  const opt = FONT_OPTIONS.find((f) => f.key === font);
  return Boolean(opt?.scripts.includes(scriptOf(language)));
}

/** The on-screen font to use: the channel's choice if it can show the language, else the language's own font. */
export function pickFont(chosen: FontKey | null | undefined, language: string | null | undefined): FontKey {
  return chosen && fontSupports(chosen, language) ? chosen : getLanguage(language).font;
}

export type Language = {
  code: string; // BCP-47, used for Intl.Segmenter and ElevenLabs voice matching
  name: string; // English name, used in prompts
  native: string; // shown in the UI
  font: FontKey; // hand-drawn font that covers the script (incl. Vietnamese accents)
  speechGuide?: string; // how natural *spoken* narration sounds in this language
};

/** Fallback for languages without a detailed guide. */
export const GENERIC_SPEECH_GUIDE =
  "Write the way a native speaker talks to a friend on camera, not the way an article reads: short spoken sentences, everyday words, contractions and fillers where natural, no written-register connectors, no sentence shapes copied from English.";

const VI_GUIDE = `Viết văn NÓI, không phải văn viết. Như một người Việt đang kể chuyện với bạn thân trước camera.
- Câu ngắn, nhịp nói. Ngắt ý bằng dấu chấm, đừng nối dài bằng "và", "cũng như", "đồng thời".
- Dùng trợ từ tự nhiên khi hợp giọng: nhé, nha, á, đó, luôn, cơ, mà, thôi, chứ, hả, ha. Đừng nhồi quá nhiều.
- Chọn từ đời thường thay vì Hán Việt/sách vở: "vì sao" thay "nguyên nhân là do", "giờ" thay "hiện nay", "nhiều" thay "một lượng lớn", "thật ra" thay "trên thực tế".
- Tránh cấu trúc dịch từ tiếng Anh: không mở câu bằng "Điều này…", không danh từ hoá "việc + động từ", hạn chế bị động "được/bị" khi người Việt không nói vậy, tránh "Nó là…", "Có một sự thật rằng…".
- Số, đơn vị, năm: viết như lúc đọc lên ("ba trăm nghìn năm", "khoảng 20 độ").
- Xưng hô đúng giọng kênh (vd "bạn", "ní", "tụi mình") và giữ nhất quán.
- Được dùng tiếng lóng/Gen Z nếu giọng kênh vui, nhưng người xem phổ thông vẫn phải hiểu.
- Đọc thầm từng câu: nếu một người Việt bình thường không nói câu đó ngoài đời, viết lại.`;

export const LANGUAGES: Language[] = [
  {
    code: "en",
    name: "English",
    native: "English",
    font: "marker",
    speechGuide:
      "Write for the ear: contractions (you're, it's, don't), short punchy sentences, everyday words over formal ones, the occasional fragment. No essay connectors like 'furthermore', 'moreover', 'in conclusion'.",
  },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt", font: "pangolin", speechGuide: VI_GUIDE },
  { code: "es", name: "Spanish", native: "Español", font: "marker" },
  { code: "pt", name: "Portuguese", native: "Português", font: "marker" },
  { code: "fr", name: "French", native: "Français", font: "marker" },
  { code: "de", name: "German", native: "Deutsch", font: "marker" },
  { code: "it", name: "Italian", native: "Italiano", font: "marker" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia", font: "marker" },
  { code: "ru", name: "Russian", native: "Русский", font: "pangolin" },
  { code: "hi", name: "Hindi", native: "हिन्दी", font: "kalam" },
  { code: "th", name: "Thai", native: "ไทย", font: "itim" },
  { code: "ja", name: "Japanese", native: "日本語", font: "yusei" },
  { code: "ko", name: "Korean", native: "한국어", font: "gamja" },
  { code: "zh", name: "Chinese (Simplified)", native: "简体中文", font: "zcool" },
];

export function getLanguage(code: string | null | undefined): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
