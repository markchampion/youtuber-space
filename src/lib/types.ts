import { z } from "zod";

export const STEPS = [
  { key: "script", label: "Script", path: "script" },
  { key: "voice", label: "Voice", path: "voice" },
  { key: "scenes", label: "Scenes", path: "scenes" },
  { key: "images", label: "Images", path: "images" },
  { key: "render", label: "Preview & Render", path: "render" },
  { key: "shorts", label: "Shorts", path: "shorts" },
  { key: "publish", label: "Publish", path: "publish" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];
export type Step = { key: StepKey; label: string; path: string };

/** Product ads: no Shorts or Publish; the script page holds the product brief. */
export const AD_STEPS: Step[] = [
  { key: "script", label: "Brief & Script", path: "script" },
  { key: "voice", label: "Voice", path: "voice" },
  { key: "scenes", label: "Scenes", path: "scenes" },
  { key: "images", label: "Images", path: "images" },
  { key: "render", label: "Preview & Render", path: "render" },
];

export type VoiceMode = "voice" | "none";

/** Steps shown for a video. Silent product ads ("none") have no Voice step. */
export function stepsFor(kind: "longform" | "product_ad" | undefined, voiceMode: VoiceMode = "voice"): readonly Step[] {
  if (kind !== "product_ad") return STEPS;
  return voiceMode === "none" ? AD_STEPS.filter((s) => s.key !== "voice") : AD_STEPS;
}

// ---------- Product ads ----------
/** What the ad is about. Images live under data/projects/<id>/product/. */
export type ProductBrief = {
  name: string;
  sellingPoints: string[];
  audience?: string;
  cta: string;
  price?: string;
  imagePaths: string[];
};

export const AdScriptSchema = z.object({
  sentences: z
    .array(z.string())
    .describe("The ad's lines in order, as many and as long as the instructions say. First = scroll-stopping hook, last = the call to action."),
});

// ---------- Ideas ----------
export const GeneratedIdeaSchema = z.object({
  title: z.string(),
  angle: z.number().int().describe("Id of the title formula used, or 0 for a fresh one"),
  hook: z.string().describe("The first 1-2 lines of narration, in the channel voice"),
  whyViral: z.string().describe("One sentence on why this could go viral"),
  score: z.number().describe("Curiosity/viral potential from 1 to 10"),
});
export const IdeaBatchSchema = z.object({ ideas: z.array(GeneratedIdeaSchema) });
export type GeneratedIdea = z.infer<typeof GeneratedIdeaSchema>;

export const EVAL_CRITERIA = [
  ["nicheFit", "Niche fit"],
  ["hookStrength", "Hook / curiosity gap"],
  ["evidenceDepth", "Real evidence available"],
  ["narrativePotential", "Scene, twist & modern mirror"],
  ["visualFit", "Fits the doodle visual style"],
  ["titleClarity", "Title clarity"],
] as const;

export const IdeaEvaluationSchema = z.object({
  scores: z.object({
    nicheFit: z.number(),
    hookStrength: z.number(),
    evidenceDepth: z.number(),
    narrativePotential: z.number(),
    visualFit: z.number(),
    titleClarity: z.number(),
  }),
  overall: z.number().describe("Overall score 1-10"),
  verdict: z.enum(["go", "improve", "skip"]),
  closestAngle: z.number().int(),
  summary: z.string().describe("2-3 sentence assessment"),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
  evidenceLeads: z
    .array(z.string())
    .describe("Real researchers, studies or sites the script could use. Only real, verifiable ones."),
  improvedVersions: z.array(
    z.object({ title: z.string(), angle: z.number().int(), hook: z.string(), why: z.string() }),
  ),
});
export type IdeaEvaluation = z.infer<typeof IdeaEvaluationSchema>;

// ---------- Script ----------
export const OutlineSchema = z.object({
  sections: z.array(
    z.object({
      key: z.string().describe("Short snake_case name of the narrative-arc beat"),
      title: z.string(),
      beats: z
        .array(z.string())
        .describe("What the narrator says here, as short ideas IN THE CHANNEL LANGUAGE and in the channel voice. No stage directions, no notes."),
      notes: z
        .array(z.string())
        .describe("Optional notes for the creator IN ENGLISH: fact-check warnings, delivery directions. Never spoken. Empty if none."),
    }),
  ),
  evidence: z.array(z.string()).describe("Named real researchers, studies, sites to use"),
});
type OutlineOut = z.infer<typeof OutlineSchema>;
/** Stored outline. `notes` is optional because outlines saved before it existed don't have it. */
export type Outline = {
  sections: (Omit<OutlineOut["sections"][number], "notes"> & { notes?: string[] })[];
  evidence: string[];
};

export const FactCheckSchema = z.object({
  claims: z.array(
    z.object({
      name: z.string().describe("The named researcher, study, site, or statistic"),
      claim: z.string().describe("What the script says about it"),
      confidence: z.enum(["high", "medium", "low"]),
      note: z.string().describe("Why; what to verify"),
    }),
  ),
});
export type FactCheck = z.infer<typeof FactCheckSchema>["claims"][number] & { verified?: boolean };

// ---------- Scenes ----------
export const SceneSchema = z.object({
  fromSentence: z.number().int(),
  toSentence: z.number().int(),
  frameType: z.string(),
  background: z.string(),
  onScreenText: z
    .string()
    .describe("Short on-screen text (ALL CAPS) or empty string. Rendered by code, not the image model."),
  description: z
    .string()
    .describe("Concrete scene: characters with hair/head variant, expressions, actions, objects. No style words."),
});
export const ScenePlanSchema = z.object({ scenes: z.array(SceneSchema) });
export type ScenePlan = z.infer<typeof ScenePlanSchema>;

// ---------- Metadata ----------
export const MetadataSchema = z.object({
  titles: z.array(z.string()),
  description: z.string(),
  tags: z.array(z.string()),
  thumbnailIdeas: z.array(z.string()),
});
export type Metadata = z.infer<typeof MetadataSchema>;

// ---------- Channel profile (AI drafts) ----------
// Mirrors ChannelProfile in src/lib/channel.ts; every field required so structured output fills it all.
export const ChannelProfileSchema = z.object({
  name: z.string().describe("Short channel name, 2-5 words"),
  niche: z.string(),
  format: z.string().describe("Kind of video in a few words, e.g. 'educational explainer, doodle animation'. Never mention length or duration."),
  voice: z.string().describe("Narration voice: person (1st/2nd/3rd), tone, pace"),
  evidenceRule: z.string(),
  extraScriptRules: z.array(z.string()),
  topicAngles: z
    .array(z.object({ id: z.number().int(), name: z.string(), template: z.string(), description: z.string() }))
    .describe("5-8 proven, repeatable title formulas for this niche (optional for the creator, used only for idea generation)"),
  visual: z.object({
    styleAnchor: z.string().describe("The art style: put before every image prompt, ends with a comma"),
    styleLock: z.string().describe("Style suffix after every image prompt: negatives, 'no text or letters', '16:9 widescreen'"),
    mainCharacter: z.string().describe("The recurring character, described precisely enough to redraw identically"),
    characterVariants: z.array(z.string()),
    conceptDevices: z.array(z.string()).describe("Recurring visual metaphors used to show abstract ideas, plus one 'Recurring props: …' line"),
    palette: z.array(z.object({ name: z.string(), hex: z.string() })),
    textColor: z.string().describe("Hex color for on-screen text"),
    paperColor: z.string().describe("Hex background color for text-only frames"),
    backgrounds: z.array(z.object({ key: z.string(), label: z.string(), description: z.string(), mood: z.string() })),
    frameTypes: z.array(z.object({ key: z.string(), label: z.string(), description: z.string(), textOnly: z.boolean() })),
  }),
  metadataRules: z.string(),
  voiceSample: z
    .string()
    .describe("One short paragraph (60–120 words) of narration in the channel language and exact voice, on any sample topic, showing how it should sound when spoken"),
  outlineTemplate: z
    .object({
      name: z.string(),
      beats: z.array(z.object({ key: z.string(), name: z.string(), purpose: z.string(), guidance: z.string(), share: z.number() })),
    })
    .describe("The story structure every video follows. The first part is the hook, with the hook formula in its guidance. 6–14 parts, reusable for any topic, story-driven for casual viewers (open loops, a puzzle for the viewer, researchers as characters, callback ending). Shares add up to ~100."),
});

// ---------- Shorts ----------
export const SeriesTextSchema = z.object({
  parts: z.array(
    z.object({
      title: z.string().describe("Hook shown on screen for this part, max ~7 words, no part number"),
      caption: z.string().describe("Post caption, 1-2 sentences, ending with the part line given"),
      hashtags: z.array(z.string()).describe("5-8 hashtags, each starting with #"),
    }),
  ),
});

export const ShortSuggestionsSchema = z.object({
  shorts: z.array(
    z.object({
      fromSentence: z.number().int(),
      toSentence: z.number().int(),
      title: z.string().describe("Hook shown on screen for the whole Short, max ~8 words"),
      reason: z.string().describe("One line: why this clip works on its own"),
      caption: z.string().describe("Post caption for TikTok / Reels / Shorts, 1-2 sentences"),
      hashtags: z.array(z.string()).describe("5-8 hashtags, each starting with #"),
    }),
  ),
});

// ---------- "Learn from a video you like" ----------
export const TranscriptAnalysisSchema = z.object({
  template: z.object({
    name: z.string().describe("Short name for this structure, e.g. 'Mystery walk-through'"),
    beats: z.array(
      z.object({
        key: z.string().describe("snake_case"),
        name: z.string().describe("Short English name of this part"),
        purpose: z.string().describe("What this part does for the viewer, reusable for ANY topic (no topic-specific facts)"),
        guidance: z.string().describe("How it's written: sentence style, devices, length. English."),
        share: z.number().describe("Rough % of the video"),
      }),
    ),
  }),
  techniques: z.array(z.string()).describe("3-5 reusable techniques that make it engaging, as short script rules in English"),
  voiceSample: z.string().describe("60-120 words of NEW narration in the channel language copying the tone and rhythm, on a different topic. Never copy sentences."),
});
export type TranscriptAnalysis = z.infer<typeof TranscriptAnalysisSchema>;
