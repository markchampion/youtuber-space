import type { ChannelProfile } from "./channel";
import { OUTLINE_TEMPLATES } from "./outline-templates";

/** Visual styles offered for product-ad channels. `prompt` becomes the profile's styleAnchor. */
export const AD_STYLE_PRESETS = [
  {
    key: "studio",
    label: "Studio product shot",
    blurb: "Clean seamless backdrop, soft studio light, premium e-commerce look.",
    prompt: "Photorealistic commercial product photography, soft diffused studio lighting, crisp focus on the product, premium advertising look,",
    swatch: ["#F4F4F5", "#18181B", "#E11D48", "#FFFFFF"],
  },
  {
    key: "lifestyle",
    label: "Lifestyle",
    blurb: "The product in real, warm everyday settings with people using it.",
    prompt: "Photorealistic lifestyle advertising photo, natural warm light, real everyday setting, shallow depth of field, the product clearly in focus,",
    swatch: ["#FDE68A", "#78350F", "#F97316", "#FFFBEB"],
  },
  {
    key: "bold",
    label: "Bold graphic",
    blurb: "Saturated color-block backgrounds, punchy social-media ad energy.",
    prompt: "Bold modern social-media ad visual, saturated color-block background, dramatic lighting, dynamic angle, the product as the hero,",
    swatch: ["#7C3AED", "#FACC15", "#0EA5E9", "#111827"],
  },
] as const;

export const PRODUCT_AD_PROFILE: ChannelProfile = {
  kind: "product_ad",
  name: "Product ads",
  niche: "Short vertical video ads for physical products, for TikTok, Reels and Shorts.",
  format: "Vertical product ad, voiceover over AI product scenes.",
  voice: "Upbeat, confident, friendly 2nd-person voiceover that talks to one viewer. Short punchy sentences, no hype words like 'revolutionary'.",
  evidenceRule: "Only claim what the product brief says. Never invent specs, prices, awards or reviews.",
  extraScriptRules: [
    "Pure voiceover only: no stage directions, emojis, hashtags or headers.",
    "Sentence 1 is the hook: a problem, a surprising benefit or a question, in under 10 words.",
    "The last sentence is the call to action, using the brief's CTA.",
  ],
  lengthMinutes: { min: 0.25, max: 0.35 },
  pacing: { maxWordsPerSentence: 14, wordsPerMinute: 160, sentencesPerImage: 1, cameraCuts: false },
  profileVersion: 2,
  outlineTemplate: OUTLINE_TEMPLATES[0],
  topicAngles: [],
  visual: {
    styleAnchor: AD_STYLE_PRESETS[0].prompt,
    styleLock:
      "the product must look exactly like the reference photo (same shape, colors, label and logo), no extra text, letters or watermarks, no distorted hands, no duplicate products, 16:9 widescreen.",
    mainCharacter: "The product from the reference photo, always the hero of the frame.",
    characterVariants: [],
    conceptDevices: [],
    palette: [
      { name: "Accent red", hex: "#E11D48" },
      { name: "Paper white", hex: "#FFFFFF" },
      { name: "Ink", hex: "#18181B" },
    ],
    textColor: "#FFFFFF",
    paperColor: "#18181B",
    font: "montserrat",
    backgrounds: [
      { key: "studio", label: "Studio", description: "seamless studio backdrop in a soft neutral tone with a subtle floor reflection", mood: "premium / hero shot" },
      { key: "lifestyle", label: "Lifestyle", description: "a real, tidy everyday setting where the product is naturally used", mood: "relatable / in use" },
      { key: "neutral", label: "Neutral", description: "plain soft gradient-free light background", mood: "clean / detail" },
    ],
    frameTypes: [
      { key: "product_hero", label: "Product hero", description: "The product centered and large, slightly low angle, dramatic light." },
      { key: "in_use", label: "In use", description: "A person's hands or a person using the product naturally; the product stays clearly visible." },
      { key: "detail_closeup", label: "Detail close-up", description: "Macro close-up of one feature, texture or material of the product." },
      { key: "lifestyle", label: "Lifestyle", description: "The product placed in an attractive real-world scene that matches its audience." },
    ],
  },
  metadataRules: "Caption under 150 characters with 3-5 relevant hashtags.",
  autopilot: { stopAfter: "render", pauseAfter: ["script", "images"], imageQuality: "medium", captions: true, kenBurns: true },
};
