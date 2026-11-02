import { lengthBudget, pacingOf, type ChannelProfile, type OutlineTemplate, type TopicAngle } from "@/lib/channel";
import { DEFAULT_OUTLINE_TEMPLATE } from "@/lib/outline-templates";
import { GENERIC_SPEECH_GUIDE, getLanguage } from "@/lib/languages";
import type { Outline } from "@/lib/types";

const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");

export function channelBrief(p: ChannelProfile): string {
  const b = lengthBudget(p);
  const opening = templateOf(p).beats[0];
  return `You are the creative engine for a viral educational YouTube channel.

<channel>
Niche: ${p.niche}
Format: ${p.format}
Video length: ${fmtRange(b.minMinutes, b.maxMinutes)} (about ${b.minWords}–${b.maxWords} words of narration)
Voice: ${p.voice}
${opening ? `Opening: ${opening.purpose}${opening.guidance ? ` ${opening.guidance}` : ""}\n` : ""}Evidence rule: ${p.evidenceRule}
Other rules:
${list(p.extraScriptRules)}

Visual style: ${p.visual.styleAnchor.replace(/,\s*$/, "")}
Main character: ${p.visual.mainCharacter}
Character variants:
${list(p.visual.characterVariants)}
</channel>
${
  p.voiceSample?.trim()
    ? `
<voice_sample>
${p.voiceSample.trim()}
</voice_sample>
Match the voice sample's register, rhythm, slang and way of addressing the viewer in everything the audience hears. Copy its tone, never its topic or facts.
`
    : ""
}
${languageRule(p)} Only ever cite real, verifiable people, studies and sources — never invent a name, date or statistic.`;
}

/**
 * Audience-facing text follows the channel language; notes for the creator stay in English
 * (they read the app in English), and image descriptions stay in English (image models do best with it).
 */
export function languageRule(p: ChannelProfile) {
  const lang = getLanguage(p.language);
  const guide = `\n\nSPOKEN STYLE (for everything the audience hears):\n${lang.speechGuide ?? GENERIC_SPEECH_GUIDE}`;
  if (lang.code === "en") return `All output is in English.${guide}`;
  return `LANGUAGE: This channel publishes in ${lang.name} (${lang.native}). Write everything the audience reads or hears in natural, native-sounding ${lang.name}: titles, hooks, narration, on-screen text, captions, descriptions, tags and hashtags (use the hashtags people in that market actually use). Write notes meant for the creator (scores, reasons, risks, fact-check notes) and any image or scene descriptions in English. JSON keys always stay in English.
Think and draft audience text directly in ${lang.name}. Never write it in English first and translate: translated text sounds stiff and is the #1 thing to avoid.${guide}`;
}

/** The angles an idea may use, or a note that there are none. */
function anglesBlock(angles: TopicAngle[]) {
  if (!angles.length) return "";
  return `\n<title_formulas>\n${angles.map((a) => `${a.id}. ${a.template}${a.description ? ` — ${a.description}` : ""}`).join("\n")}\n</title_formulas>\n`;
}

export function ideasPrompt(opts: { count: number; seed?: string; likeTitle?: string; fresh?: boolean; avoid: string[]; angles: TopicAngle[] }) {
  const has = opts.angles.length > 0;
  const spread = has ? "Spread them across the title formulas above and set angle to the formula's id." : "Invent title formulas that fit this audience. Use angle 0 for every idea.";
  return `Generate ${opts.count} viral video ideas for this channel.
${anglesBlock(opts.angles)}${opts.seed ? `Focus on this theme from the creator: "${opts.seed}". ${has ? "Use the title formulas where they fit." : "Use angle 0."}` : spread}
${opts.likeTitle ? `Make them variations in the spirit of: "${opts.likeTitle}" (different topics, same appeal).` : ""}
${opts.fresh && has ? "Don't limit yourself to these formulas: at least half the ideas should use a fresh title formula that could work for this audience. Use angle 0 for those." : ""}
Each title must be scroll-stopping, under 70 characters, and deliverable by a well-researched script (no clickbait the script can't pay off). The hook is the first 1–2 lines of narration in the channel's voice, in the style of the channel's opening. Score honestly: most ideas should land 5–8.
${opts.avoid.length ? `\nDo not repeat or closely paraphrase these existing titles:\n${list(opts.avoid.slice(0, 150))}` : ""}`;
}

export function evaluatePrompt(opts: { idea: string; notes?: string; feedback?: string; previous?: string; angles: TopicAngle[] }) {
  return `Evaluate this video idea submitted by the creator for this channel.
${opts.angles.length ? anglesBlock(opts.angles) : "\nThe channel has no fixed title formulas: use angle 0 everywhere.\n"}
<idea>${opts.idea}</idea>
${opts.notes ? `<creator_notes>${opts.notes}</creator_notes>` : ""}
${opts.previous ? `<previous_evaluation>${opts.previous}</previous_evaluation>` : ""}
${opts.feedback ? `<creator_feedback>${opts.feedback}</creator_feedback>\nTake the feedback into account in the improved versions.` : ""}

Score each criterion from 1 to 10 and be a candid editor, not a cheerleader:
- nicheFit: how squarely it sits in the channel niche
- hookStrength: strength of the curiosity gap / universal modern concern it bridges to
- evidenceDepth: how much real, citable material exists (named studies, people, sources)
- narrativePotential: can it carry the channel's video structure from opening to closing line
- visualFit: can it be told in the channel's visual style (topics that are hard to draw simply score lower)
- titleClarity: is the title instantly understandable and under 70 characters

Verdict: "go" if overall ≥ 7.5 with no fatal risk, "improve" if the core is good but the framing needs work, "skip" if it fundamentally doesn't fit or lacks real evidence.
List concrete risks (thin evidence, can't deliver on the title's promise, too broad, sensitive).
evidenceLeads: only real, verifiable names you are confident exist.
Provide 3–5 improved versions (title + angle id + a 1–2 line hook + why it's stronger). Keep the creator's core topic.`;
}

/** Rules that keep outlines and scripts story-driven for casual viewers rather than lecture-like. */
export const CASUAL_RULES = `Write for casual viewers, not students:
- Every section needs something the viewer can picture: a scene, an object, a person doing something, or a comparison to their own life.
- Researchers and discoveries are mini-stories (who, where, what they did, what they found), never bare citations.
- No jargon unless it's instantly explained with an everyday comparison.
- Make numbers relatable ("17 hours a week, so you'd hit that by Wednesday afternoon").
- Talk to the viewer: ask them to guess, imagine or admit what they believe. Open a question every 20–40 seconds and pay it off later.
- Each section should end by opening the next question, so there's always a reason to keep watching.`;

export function templateOf(p: ChannelProfile): OutlineTemplate {
  return p.outlineTemplate?.beats?.length ? p.outlineTemplate : DEFAULT_OUTLINE_TEMPLATE;
}

/** Word and time budget for each part of the structure, scaled to the channel's target length. */
export function beatBudgets(p: ChannelProfile, template: OutlineTemplate = templateOf(p)) {
  const b = lengthBudget(p);
  const total = template.beats.reduce((a, x) => a + x.share, 0) || 1;
  return template.beats.map((beat) => {
    const words = Math.max(5, Math.round((b.targetWords * beat.share) / total));
    return { beat, words, secs: Math.round((words / b.wpm) * 60) };
  });
}

/** How long the video may be, in words and spoken minutes. */
export function lengthLine(p: ChannelProfile) {
  const b = lengthBudget(p);
  return `Hard limit: at most ${b.maxWords} words in total (about ${fmtMinutes(b.maxMinutes)} spoken). Aim for about ${b.targetWords} words.`;
}

function fmtRange(min: number, max: number) {
  return min === max ? fmtMinutes(min) : `${Math.round(min * 10) / 10}–${fmtMinutes(max)}`;
}

function fmtMinutes(m: number) {
  const secs = Math.round(m * 60);
  return secs < 120 ? `${secs} seconds` : `${Math.round(m * 10) / 10} minutes`;
}

export function outlinePrompt(p: ChannelProfile, title: string, hook?: string | null, template: OutlineTemplate = templateOf(p)) {
  const budget = lengthBudget(p);
  const beats = beatBudgets(p, template)
    .map(({ beat: b, words, secs }, i) => `${i + 1}. key="${b.key}", ${b.name} (~${words} words, ~${secs}s): ${b.purpose}${b.guidance ? ` Guidance: ${b.guidance}` : ""}`)
    .join("\n");
  return `Create the outline for a video titled "${title}".${hook ? ` Suggested opening: "${hook}"` : ""}

Follow this structure ("${template.name}"): exactly one section per step, in this order, using the given key:
<structure>
${beats}
</structure>

For each section: title = a readable label in the channel language; 2–6 beats = what the narrator actually says there, already in the channel voice and spoken style, as short, picturable lines. Put any direction, delivery tip or fact-check warning in that section's "notes" (English), never in the beats.
List the real, named sources the script should cite in "evidence" (follow the evidence rule), only ones you're certain are real.

Length: the whole video must fit in about ${budget.targetWords} words (${fmtMinutes(budget.maxMinutes)} at most). Beats are short notes of what gets said, not the finished script: plan only as much material as fits each part's word budget.

${CASUAL_RULES}`;
}

/** Sentence-level rules shared by the script, polish and shorten prompts. */
export function sentenceRules(p: ChannelProfile) {
  const n = pacingOf(p).maxWordsPerSentence;
  return `- Every sentence is at most ${n} words: one concrete idea a viewer could picture. Split longer thoughts into several sentences.
- Vary the rhythm with some very short sentences (2–5 words), but never exceed ${n} words.`;
}

export function scriptPrompt(p: ChannelProfile, title: string, outline: Outline) {
  const o = outline.sections.map((s) => `${s.title}:\n${list(s.beats)}`).join("\n\n");
  const notes = outline.sections.flatMap((s) => (s.notes ?? []).map((n) => `${s.title}: ${n}`));
  return `Write the full narration script for "${title}" following this approved outline:

<outline>
${o}

Evidence to weave in: ${outline.evidence.join("; ")}
</outline>
${notes.length ? `\n<creator_notes>\nRespect these, but never say them out loud or let them change the voice:\n${list(notes)}\n</creator_notes>\n` : ""}
Rules:
- Length: ${lengthLine(p)} Part budgets: ${beatBudgets(p)
    .map(({ beat, words }) => `${beat.name} ~${words}`)
    .join(", ")}. If the outline has more material than fits, cut the weakest beats, never the hook, the key reveal or the ending.
- Pure narration as plain text. No title, no headers, no markdown, no brackets, no stage directions.
- Separate paragraphs with a blank line. Keep paragraphs to 2–6 sentences — each paragraph is voiced separately.
- Follow the channel voice, the structure of the outline, the other rules and the evidence rule.
- It must sound like someone talking, not reading: follow the SPOKEN STYLE rules${p.voiceSample?.trim() ? " and the voice sample" : ""}.
${sentenceRules(p)}

${CASUAL_RULES}

Output only the script.`;
}

/** Second pass: rewrite for natural spoken language without changing facts or structure. */
export function polishPrompt(p: ChannelProfile, script: string) {
  const lang = getLanguage(p.language);
  return `You are a native ${lang.name} script editor for YouTube narration. Rewrite this script so it sounds like a real ${lang.name} speaker talking to a friend on camera, in this channel's voice.

<script>
${script}
</script>

Rules:
- Keep every fact, name, number, date and source exactly. Don't add new facts. Don't cut the jokes.
- Keep exactly the same paragraphs: same count, same order, separated by one blank line. You may rephrase and re-split sentences inside a paragraph.
- Fix anything that sounds written, formal, stiff or translated from English. Prefer everyday words and natural spoken rhythm.
- Don't make it longer: stay at or under ${lengthBudget(p).maxWords} words.
${sentenceRules(p)}

${lang.speechGuide ?? GENERIC_SPEECH_GUIDE}

Output only the rewritten script.`;
}

export function rewriteParagraphPrompt(script: string, paragraph: string, instruction: string) {
  return `Here is a narration script:
<script>
${script}
</script>

Rewrite ONLY this paragraph:
<paragraph>
${paragraph}
</paragraph>

Instruction from the creator: ${instruction || "Make it tighter and more gripping."}
Keep it consistent with the surrounding script, the channel voice and rhythm. Output only the rewritten paragraph as plain text.`;
}

export function factCheckPrompt(script: string) {
  return `Extract every factual anchor from this narration script that a careful editor should verify: named people, studies (with years), places, dates, and statistics.

<script>
${script}
</script>

For each, state what the script claims, and your confidence that the name exists AND the claim about it is accurate:
- high: well-known, you are certain
- medium: the name is real but the specific detail (year, number, finding) should be checked
- low: you are unsure the source exists or the claim is likely wrong/garbled
In "note", say precisely what to check or what's wrong.`;
}

export function scenesPrompt(p: ChannelProfile, numbered: string, sentenceCount: number) {
  const bgs = p.visual.backgrounds.map((b) => `- ${b.key}: ${b.description} (use for: ${b.mood})`).join("\n");
  const frames = p.visual.frameTypes.map((f) => `- ${f.key}: ${f.description}`).join("\n");
  return `Plan the visuals for this narrated video. The script is split into ${sentenceCount} numbered sentences (0-based):

<sentences>
${numbered}
</sentences>

Group consecutive sentences into scenes. Each scene is ONE still image shown while its sentences are spoken.
- Scenes must cover every sentence exactly once, in order, with no gaps: the first scene starts at 0, each next scene starts at previous toSentence + 1, the last ends at ${sentenceCount - 1}.
- Fast pacing: a scene is ${pacingOf(p).sentencesPerImage === 1 ? "one sentence" : `about ${pacingOf(p).sentencesPerImage} sentences (never more than ${pacingOf(p).sentencesPerImage + 1})`}, at most ~8 seconds of narration. Start a new scene whenever the idea or picture changes, even mid-thought.${pacingOf(p).cameraCuts ? " The video cuts to a closer framing of the same image at each sentence, so compose each image with 2–3 distinct areas worth zooming into." : ""}
- Translate abstract narration into concrete visuals using the channel's visual devices:
${list(p.visual.conceptDevices)}

frameType must be one of:
${frames}

background must be one of these keys (match the emotional tone):
${bgs}

onScreenText: a short phrase or number in the channel's language (ALL CAPS if the script has capitals) when the frame benefits from it (e.g. "300,000 YEARS", "SURVIVAL"), otherwise "". It is overlaid by code later, so NEVER put words in the description.
For concept_text frames the image is not generated at all — only onScreenText is shown — so use them for numbers and key terms.

description (always in English, for the image model): concrete and specific — who is in the frame (for every person, name which character or variant it is and restate their defining look from the channel's character description), their exact expression and action, the objects, and composition. Keep the important content in the middle of the frame. Do NOT include style words (the style is added automatically) and do NOT describe any text, letters or labels.`;
}

export function metadataPrompt(p: ChannelProfile, title: string, script: string) {
  return `Create YouTube metadata for the video "${title}".

<script>
${script.slice(0, 20000)}
</script>

Rules: ${p.metadataRules}
Provide 3 alternative titles (best first), the full description as plain text with the hashtag line at the end, 25–40 tags (plain keywords, no #), and 3 thumbnail concepts.

Thumbnail concepts (2–3 sentences each), built for a high click-through rate:
- Every concept shows what the title "${title}" promises. The thumbnail and title sit side by side in the feed and must read as one idea: someone who sees only the image should be able to guess what the video is about. Use the script only for concrete, accurate details of that subject, never to switch to a side story or a minor moment.
- Open each concept with a sentence naming the title's subject as the hero of the image (a video titled "Why the UFO Came Back" shows the UFO returning). Not a generic picture of the channel's topic.
- One focal point, big and instantly readable on a phone. Show the title's subject at its most intriguing, or the question the title asks, without giving the answer away.
- Give it the emotional vibe that fits the story, and name it: mystery (darkness, fog, a single eerie light source, silhouettes, something half hidden), danger, awe, shock or curiosity. Describe the lighting and colors that create it (dramatic contrast, a bright subject against a dark background).
- The channel's main character only appears when a human reaction makes it stronger (for example small in the corner, looking up in shock). Then call them "the main character" and describe only their pose and expression, never their look. Most concepts should not need them.
- End with 2–4 words of thumbnail text that build on the title's question or claim with a curiosity hook, without repeating it word for word (e.g. "IT CAME BACK", "NOBODY EXPLAINED"), in the channel's language, and say where the text goes (in an empty area away from the subject).
- Make the 3 concepts clearly different: different angles on the title's subject, not three versions of one image.`;
}

export function shortsPrompt(numbered: string, count: number) {
  return `This is the narration of a long video, one numbered sentence per line with its start time:

<sentences>
${numbered}
</sentences>

Pick the ${count} best moments to publish as vertical Shorts (YouTube Shorts, TikTok, Reels).
Each clip is a contiguous range of sentences (fromSentence..toSentence, inclusive) that:
- lasts 30–60 seconds (use the start times),
- opens with a sentence that hooks on its own, with no "as we saw" or unresolved "this/that" references,
- makes sense without the rest of the video and ends on a satisfying line.
Prefer surprising facts, vivid scenes and the counterintuitive twist. Clips must not overlap.
For each: an on-screen hook title (max ~8 words, curiosity gap), a one-line reason, a post caption and 5–8 hashtags.`;
}

/** Titles and captions for consecutive parts of one video, posted as a series. */
export function seriesPrompt(parts: string[]) {
  const n = parts.length;
  return `This long video is being posted as a series of ${n} consecutive vertical Shorts (YouTube Shorts, TikTok, Reels). Here is the narration of each part, in order:

${parts.map((p, i) => `<part n="${i + 1}">\n${p}\n</part>`).join("\n\n")}

For each part, in the same order, write:
- title: an on-screen hook for that part, max ~7 words, curiosity gap. Don't include "Part 1" etc. (it's added automatically). Part 2 onwards may assume the viewer saw the earlier parts.
- caption: 1–2 sentences for the post, ending with "Part k/${n}, part k+1 next" (use the real numbers; for the last part end with "Part ${n}/${n}, full video on the channel").
- hashtags: 5–8 hashtags.
Return exactly ${n} parts.`;
}

/** Split over-long sentences without changing meaning, facts or paragraphs. */
export function shortenPrompt(p: ChannelProfile, script: string) {
  const lang = getLanguage(p.language);
  return `Here is a ${lang.name} narration script. Split every sentence that is too long into shorter spoken sentences.

<script>
${script}
</script>

Rules:
${sentenceRules(p)}
- Keep every fact, name, number and joke. Don't add content. Keep the channel voice.
- Keep exactly the same paragraphs: same count, same order, separated by one blank line.
- Sentences that are already short stay as they are.
- Don't make it longer: stay at or under ${lengthBudget(p).maxWords} words.

Output only the script.`;
}

/** Cut an over-long script down to the channel's length. */
export function trimPrompt(p: ChannelProfile, script: string, words: number) {
  const lang = getLanguage(p.language);
  const b = lengthBudget(p);
  const goal = Math.round(b.maxWords * 0.95);
  return `Here is a ${lang.name} narration script of about ${words} words. It is too long: the video may be at most ${b.maxWords} words (about ${fmtMinutes(b.maxMinutes)} spoken). Cut it to about ${goal} words.

<script>
${script}
</script>

Rules:
- Remove the weakest sentences, side details, repeated points and extra examples. Keep the hook, the key facts and named sources, the main reveal and the ending (with its callback).
- Don't add content and don't summarize: what stays reads exactly like the original, in the same voice.
- Keep the paragraph order and separate paragraphs with one blank line. You may drop a paragraph entirely if it isn't needed.
${sentenceRules(p)}

Output only the script.`;
}
