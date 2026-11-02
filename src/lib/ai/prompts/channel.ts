import type { ChannelProfile } from "@/lib/channel";
import { ANCIENT_HUMANS_PROFILE } from "@/lib/channel-seed";
import { getLanguage } from "@/lib/languages";

const EXAMPLE = JSON.stringify(ANCIENT_HUMANS_PROFILE, null, 1);

export const CHANNEL_SYSTEM = `You design YouTube channel "profiles" for an app that turns ideas into narrated, illustrated explainer videos.
A profile is the rulebook every later prompt follows: idea generation, script writing, scene planning, image prompts and metadata.

Here is an existing profile, shown ONLY as an example of the level of detail and structure expected. Never reuse its niche, topics, character, colors or wording unless asked:
<example_profile>
${EXAMPLE}
</example_profile>

Rules for any profile you write:
- topicAngles: 5–8 proven, repeatable title formulas that actually go viral in this niche, ids 1..n.
- visual.styleAnchor starts every image prompt and ends with a comma; visual.styleLock ends every image prompt and must include "no text or letters" and "16:9 widescreen".
- On-screen text is drawn by code, never by the image model. Include exactly one frameType with key "concept_text" and textOnly true (plain background + big text); all other frame types have textOnly false.
- Include a background with key "neutral". Background and frame type keys are short snake_case.
- mainCharacter must be specific enough to draw identically every time (shape, colors, hair, clothes, face).
- Palette: 8–15 named hex colors that suit the style. textColor and paperColor must be readable together.
- Only real, verifiable research may ever be cited, so the evidence rule should say so.
- Never put a video length or duration in any field: the creator sets length separately, in minutes.
- outlineTemplate: the first part is the hook; put the hook formula in its guidance.
- voiceSample: write it directly in the channel's language as natural SPOKEN narration (how a native speaker talks on camera, not how an article reads).`;

export function draftChannelPrompt(opts: { description: string; examples?: string; style: string; tone?: string; language?: string }) {
  const lang = getLanguage(opts.language);
  const langNote =
    lang.code === "en"
      ? ""
      : `\nThe channel publishes in ${lang.name} (${lang.native}). Write the profile's instructions in English, but make topicAngles templates natural ${lang.name} title formulas, and tailor the voice, the hook, examples and metadata rules to a ${lang.name}-speaking audience.`;
  return `Create a complete channel profile.${langNote}

<channel_description>${opts.description}</channel_description>
${opts.examples ? `<titles_or_channels_they_like>${opts.examples}</titles_or_channels_they_like>` : ""}
<visual_style>${opts.style}</visual_style>
${opts.tone ? `<narration_tone>${opts.tone}</narration_tone>` : ""}

Make every field specific to this niche and style.`;
}

export const SECTION_LABELS = {
  outline: "outline template (the structure every video follows: its parts, their purpose, guidance and share)",
  essentials: "name, niche, narration voice, voice sample, art style (visual.styleAnchor) and main character",
  angles: "topic angles",
  story: "format, evidence rule and extra script rules",
  visual: "visual system: things to always avoid (styleLock), character variants, visual devices and recurring props, palette, text/paper colors, backgrounds and frame types",
  metadata: "metadata rules",
} as const;
export type ProfileSection = keyof typeof SECTION_LABELS;

export function rewriteSectionPrompt(profile: ChannelProfile, section: ProfileSection, instruction: string) {
  return `Here is the current channel profile:
<profile>
${JSON.stringify(profile, null, 1)}
</profile>

Rewrite ONLY the ${SECTION_LABELS[section]} according to this instruction: "${instruction}".
Return the full profile. Copy every other field unchanged.`;
}

export function analyzeTranscriptPrompt(profile: ChannelProfile, transcript: string) {
  const lang = getLanguage(profile.language);
  return `Here is the transcript of a YouTube video the creator loves. Work out WHY it keeps casual viewers watching, so their channel can reuse the structure on its own topics.

<transcript>
${transcript.slice(0, 60000)}
</transcript>

Return:
- template: the video's structure as 6–14 parts in order. Each part's purpose and guidance must be reusable for ANY topic (describe the move, e.g. "a puzzle the viewer guesses, then the opposite is revealed", never this video's facts). Shares add up to about 100.
- techniques: 3–5 short script rules that capture what makes it engaging (pacing, questions to the viewer, how evidence is told, how numbers are made relatable).
- voiceSample: 60–120 words of NEW narration in ${lang.name}, on a different topic, that copies the tone, rhythm and sentence length. Never copy its sentences.`;
}
