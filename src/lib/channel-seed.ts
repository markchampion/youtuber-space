import type { ChannelProfile } from "./channel";
import { OUTLINE_TEMPLATES } from "./outline-templates";

// Extracted from the original "PROMPT NGÁCH CON NGƯỜI CỔ ĐẠI - H2DEV" chat prompt.
export const ANCIENT_HUMANS_PROFILE: ChannelProfile = {
  name: "Ancient Humans (doodle)",
  niche:
    "Ancient humans, human prehistory, evolution, anthropology, and survival — how early humans actually lived, hunted, slept, raised children, and handled everyday life. Occasional crossovers into medieval life, weird history, and human psychology.",
  format: "Educational explainer, hand-drawn doodle animation.",
  voice:
    'Calm, intelligent 2nd-person narration throughout ("you", "your ancestors", "your body", "your brain") — never "we" or "I".',
  evidenceRule:
    "Weave at least 3 real named researchers, studies, or archaeological sites naturally into the narration (e.g., Richard Lee's 1963 study, James Suzman, Polly Wiessner, Chauvet Cave, Blombos Cave). Never invent names — only use real ones. Decode every scientific term in plain English the moment it appears.",
  extraScriptRules: [
    "Pure narration only — no headers, bullet points, visual cues, stage directions or parenthetical notes.",
    "Open with a hook that makes the first 4 lines impossible to stop reading.",
    "Always end by reflecting the ancient or scientific truth back onto something the viewer feels or does today.",
    "Write numbers the way they should be spoken when it matters for narration clarity.",
    "Rhythm: short sentence, short sentence, one longer sentence that builds depth, short sentence. A question every 4–6 sentences.",
  ],
  lengthMinutes: { min: 9, max: 14 },
  profileVersion: 2,
  outlineTemplate: {
    ...OUTLINE_TEMPLATES[0],
    beats: OUTLINE_TEMPLATES[0].beats.map((b, i) =>
      i === 0
        ? {
            ...b,
            guidance: `${b.guidance} Hook: drop the viewer inside an ancestral or everyday sensory moment ("You wake up when your body is ready. No alarm, no schedule."), pivot with a reframe ("For 99% of human history, this wasn't a hypothetical."), then a striking modern statistic.`,
          }
        : b,
    ),
  },
  topicAngles: [
    {
      id: 1,
      name: "What / How did ancient humans ___?",
      template: "What / How Did Ancient Humans ___?",
      description:
        "Bridges a universal modern concern (jobs, privacy, sleep, raising children, hygiene) to prehistoric life.",
    },
    {
      id: 2,
      name: "Survival",
      template: "How Did Ancient Humans Survive ___?",
      description: "Survival against a vivid threat (deadliest predators, deadly winters, the Ice Age, starvation).",
    },
    {
      id: 3,
      name: "Craziest / weirdest",
      template: "The CRAZIEST / WEIRDEST ___ Used by Ancient Humans",
      description: "A superlative, curiosity-gap reveal of strange real methods.",
    },
    {
      id: 4,
      name: "What ___ was like",
      template: "What ___ Was Like in Ancient / Medieval Times",
      description:
        "An everyday or taboo bodily/social topic (the bathroom, periods, dating, hygiene, unwanted pregnancy) treated honestly.",
    },
    {
      id: 5,
      name: "POV / You wouldn't last",
      template: "Why You Wouldn't Last a Day in ___ / POV: Your Life as ___",
      description: "An immersive 2nd-person scenario that puts the viewer in the past.",
    },
    {
      id: 6,
      name: "What if?",
      template: "What If ___?",
      description:
        'A provocative existential or counterfactual question grounded in real data (e.g., "What If Neanderthals Had Not Gone Extinct?").',
    },
  ],
  visual: {
    styleAnchor:
      "Hand-drawn 2D doodle cartoon animation, flat solid colors, bold black hand-drawn outlines, slightly wobbly imperfect marker lines,",
    styleLock:
      "no gradients, no drop shadows, no photographic textures, no photorealism, no 3D render, no realistic faces, no anime, no text or letters, 16:9 widescreen, simple educational YouTube explainer doodle style.",
    mainCharacter:
      'The main "you" character: a stick figure with a large round white head, simple black dot eyes, expressive thin eyebrows, a simple line mouth, thin black stick limbs, small black blob hands, and spiky bright ORANGE hair. Big readable expressions: gritted teeth + angled brows = strain; curved brows + frown = worry; small smile = calm; wide eyes = surprise.',
    characterVariants: [
      "Bald round white head = neutral modern everyman",
      "Shaggy messy brown hair = ancient / prehistoric human",
      "Gray hair in a bun + colored dress = elder / grandmother",
      "May wear flat single-color clothing (blue, yellow, red, purple)",
    ],
    conceptDevices: [
      'Cloud-shaped thought bubble containing a small scene or symbol ("?")',
      'Big bold RED X across the frame = "NOT this / wrong"',
      "Dark rain cloud with blue raindrops over a sad figure = hardship",
      "Shattering / cracking gray objects = vulnerability / collapse",
      "Campfire with seated stick figures = tribe / social life",
      "Explorer stick figure (brown pith helmet, backpack, lantern) = archaeologist / discovery",
      "Recurring props: chunky flat cartoon objects with thick black outlines (wooden crates, gray boulders, lanterns, cribs, campfires, simple trees, shields)",
    ],
    palette: [
      { name: "Orange", hex: "#F58220" },
      { name: "Sky blue", hex: "#7FB5D5" },
      { name: "Cave light blue", hex: "#ABD3E5" },
      { name: "Grass green", hex: "#4E9A45" },
      { name: "Sand tan", hex: "#D2B488" },
      { name: "Dirt brown", hex: "#8B5A2B" },
      { name: "Wood brown", hex: "#7A4F2A" },
      { name: "Rock gray", hex: "#8A8A8A" },
      { name: "Night navy", hex: "#283A6E" },
      { name: "Deep indigo", hex: "#322B5E" },
      { name: "Red text", hex: "#E0302B" },
      { name: "Yellow", hex: "#F4C430" },
      { name: "Purple", hex: "#8B7CB0" },
      { name: "Cream", hex: "#F5F1E6" },
      { name: "White", hex: "#FFFFFF" },
    ],
    backgrounds: [
      {
        key: "prehistoric",
        label: "Prehistoric savanna",
        description: "flat orange sky, tan ground with grass tufts, a lone acacia tree",
        mood: "ancient / prehistoric / dawn / dusk / deep past",
      },
      {
        key: "outdoor",
        label: "Outdoor day",
        description: "flat light blue sky, tan-brown ground, simple green trees, puffy white clouds with black outlines",
        mood: "outdoor / nature / daily life",
      },
      {
        key: "night",
        label: "Calm night",
        description: "flat dark navy background, yellow crescent moon, gray ground",
        mood: "calm night",
      },
      {
        key: "deep_night",
        label: "Deep night",
        description: "flat deep indigo background with scattered star dots, brown ground",
        mood: "deep night / sleeping",
      },
      {
        key: "neutral",
        label: "Neutral / modern",
        description: "plain white or cream background, optional gray ground strip",
        mood: "neutral / modern / concept",
      },
      {
        key: "hardship",
        label: "Hardship",
        description: "cream background with a dark gray rain cloud and blue raindrops",
        mood: "danger / hardship / sadness",
      },
      {
        key: "cave",
        label: "Cave exterior",
        description: "solid light blue sky, dark cave entrance in brown rock",
        mood: "discovery / archaeology",
      },
    ],
    frameTypes: [
      {
        key: "concept_text",
        label: "Concept text",
        description: "Plain cream background + bold red ALL-CAPS hand-lettered text centered (a number, a term, a key phrase).",
        textOnly: true,
      },
      {
        key: "character_scene",
        label: "Character scene",
        description: "One or more stick figures doing something concrete in a setting.",
      },
      {
        key: "label_on_object",
        label: "Label on object",
        description: "A large object (boulder, hourglass) that will have a key word overlaid across it.",
      },
      {
        key: "thought_bubble",
        label: "Thought bubble",
        description: "Cloud-shaped bubble above a stick figure's head containing a mini-scene or symbol.",
      },
      {
        key: "red_x",
        label: "Red X negation",
        description: "A confident figure or idea with a big bold red X drawn across the whole frame.",
      },
      {
        key: "campfire",
        label: "Tribe / campfire",
        description: "Several white-headed stick figures around an orange campfire on tan ground.",
      },
      {
        key: "archaeologist",
        label: "Archaeologist",
        description: "Stick figure with brown pith helmet, backpack, yellow lantern beside a dark cave entrance.",
      },
      {
        key: "evolution",
        label: "Evolution sequence",
        description: "Left-to-right human/creature progression with a black right-pointing arrow.",
      },
      {
        key: "hardship",
        label: "Sadness / hardship",
        description: "Sad orange-haired stick figure hugging knees under a dark gray rain cloud with blue raindrops.",
      },
    ],
  },
  metadataRules:
    "Title under 70 characters using the channel's proven angles, no clickbait the script doesn't deliver. Description: 2–3 sentence hook mirroring the script opening, a 3–4 sentence summary in calm 2nd person, a like/comment/subscribe line, then 15–25 hashtags on one line. Tags: 25–40 SEO keywords mixing broad terms (ancient humans, human evolution, prehistory, anthropology, early humans, hunter gatherers) with long-tail phrases from the topic.",
};
