import type { ChapterRole, OutlineBeat, OutlineTemplate } from "./channel";

// Built-in video structures. "Story mystery explainer" is modelled on story-driven explainers such as
// "What Did Ancient Humans Actually Do All Day?" (Ink Explainer): open loops, a puzzle the viewer plays,
// researchers as characters, and an ending that calls back to the opening.

export const OUTLINE_TEMPLATES: OutlineTemplate[] = [
  {
    name: "Story mystery explainer",
    beats: [
      { key: "cold_open", name: "Cold open in your life", purpose: "Drop the viewer into a moment from their own day that the topic will flip.", guidance: "2nd person, sensory, 3–5 very short sentences. No context, no facts yet.", share: 5 },
      { key: "rewind", name: "Rewind & contrast", purpose: "Jump to the other world and show the same moment there.", guidance: "One concrete person and 2–3 visible objects. End on a question the viewer has never asked.", share: 5 },
      { key: "objection", name: "Your brain pushes back", purpose: "Voice the viewer's assumption ('everyone believes…') so the reveal lands harder.", guidance: "Say the common belief plainly, then hint that the proof was hidden somewhere.", share: 5 },
      { key: "mystery", name: "The mystery", purpose: "State the puzzle as one clear question the video promises to answer.", guidance: "Tie it to something the viewer owns or does today.", share: 5 },
      { key: "puzzle", name: "A puzzle the viewer plays", purpose: "Show two things and ask the viewer to guess, then reveal the opposite of what they expect.", guidance: "Describe both so they can be drawn. 'Take a guess.' Then the reveal, then why it matters.", share: 12 },
      { key: "walkthrough", name: "Walk through it", purpose: "'Let me walk you through…': an immersive, step-by-step scene of how it actually worked.", guidance: "2nd person, present tense, what you see, do and hear. One action per sentence.", share: 14 },
      { key: "doubt", name: "Sounds too good?", purpose: "Admit the doubt the viewer has now.", guidance: "One or two lines, then 'so let's deal with that'.", share: 3 },
      { key: "researcher", name: "The researcher's story", purpose: "Proof told as a story: who went where, what they did, what they found, then that others found it too.", guidance: "Real names and places only. Make the number relatable ('you'd hit that by Wednesday afternoon').", share: 15 },
      { key: "nobody_tells", name: "The part nobody tells you", purpose: "A surprising layer that deepens the story.", guidance: "Evidence as mini-stories (an object, a place, a discovery), each one easy to picture.", share: 12 },
      { key: "meaning", name: "What it really means", purpose: "The bigger idea behind the facts, in plain words.", guidance: "Ask the viewer a direct question, then answer it simply.", share: 9 },
      { key: "twist", name: "The twist", purpose: "The cost, the catch or the unexpected turn.", guidance: "Keep it concrete and fair; no lecture.", share: 8 },
      { key: "callback", name: "Callback ending", purpose: "Return to the cold-open moment, now seen completely differently.", guidance: "Echo the first lines. End on one short line that sticks.", share: 7 },
    ],
  },
  {
    name: "Classic explainer",
    beats: [
      { key: "hook", name: "Hook", purpose: "A sensory 2nd-person moment that makes the first lines impossible to stop.", guidance: "3–4 short sentences.", share: 8 },
      { key: "reframe", name: "Reframe", purpose: "Show this was normal for most of history and contrast it with today.", guidance: "One striking modern statistic.", share: 8 },
      { key: "evidence", name: "Evidence", purpose: "A named study, then confirmation from other sources.", guidance: "Researchers as characters, numbers made relatable.", share: 25 },
      { key: "scene", name: "Reconstructed scene", purpose: "'Let's reconstruct a day': a concrete scene the viewer can picture.", guidance: "Present tense, 2nd person.", share: 25 },
      { key: "twist", name: "Twist", purpose: "The counterintuitive turn.", guidance: "Short and concrete.", share: 14 },
      { key: "mirror", name: "Modern mirror", purpose: "Reflect it back onto the viewer's life today.", guidance: "Something they feel or do.", share: 12 },
      { key: "close", name: "Close", purpose: "Echo the first line, completely reframed.", guidance: "One or two short lines.", share: 8 },
    ],
  },
  {
    name: "Top N countdown",
    beats: [
      { key: "hook", name: "Hook", purpose: "Tease the strangest item without revealing it.", guidance: "'Number one will change how you see ___.'", share: 6 },
      { key: "item_5", name: "#5", purpose: "The easiest surprising item.", guidance: "Picture → fact → why it's weird → quick comparison.", share: 16 },
      { key: "item_4", name: "#4", purpose: "Stranger.", guidance: "Same rhythm; end with a question that leads to the next.", share: 16 },
      { key: "item_3", name: "#3", purpose: "Stranger still.", guidance: "Include a real researcher or discovery as a mini-story.", share: 17 },
      { key: "item_2", name: "#2", purpose: "Almost unbelievable.", guidance: "Ask the viewer to guess before revealing.", share: 17 },
      { key: "item_1", name: "#1", purpose: "The payoff promised in the hook.", guidance: "The biggest reveal and what it means for the viewer.", share: 20 },
      { key: "close", name: "Close", purpose: "One line tying it back to the viewer's life.", guidance: "Short and memorable.", share: 8 },
    ],
  },
  {
    name: "Day in the life (POV)",
    beats: [
      { key: "wake", name: "You wake up", purpose: "Put the viewer in the body of someone from that world.", guidance: "2nd person, present tense, what you see and feel.", share: 12 },
      { key: "morning", name: "Morning", purpose: "The first tasks, with the 'why' in one line each.", guidance: "One action per sentence.", share: 18 },
      { key: "problem", name: "Something goes wrong", purpose: "A realistic challenge of that life.", guidance: "Raise the stakes; ask 'what would you do?'", share: 18 },
      { key: "evidence", name: "How we know", purpose: "The real evidence behind the scene, told as a discovery story.", guidance: "Named, real sources only.", share: 16 },
      { key: "evening", name: "Evening", purpose: "How the day ends: food, people, stories.", guidance: "Warm and concrete.", share: 16 },
      { key: "compare", name: "You vs them", purpose: "Compare that day with the viewer's day today.", guidance: "Relatable numbers and objects.", share: 12 },
      { key: "close", name: "Close", purpose: "A last line that stays with the viewer.", guidance: "Callback to waking up.", share: 8 },
    ],
  },
  {
    name: "Myth vs fact",
    beats: [
      { key: "myth", name: "The myth", purpose: "State the belief everyone has, as the viewer would say it.", guidance: "Show where people picked it up (movies, school).", share: 12 },
      { key: "crack", name: "The first crack", purpose: "One detail that doesn't fit the myth.", guidance: "A concrete object or observation.", share: 14 },
      { key: "investigation", name: "The investigation", purpose: "How researchers found out, told as a story.", guidance: "Real names, places, methods.", share: 24 },
      { key: "fact", name: "What actually happened", purpose: "The real picture, step by step.", guidance: "Short, visual sentences.", share: 24 },
      { key: "why_myth", name: "Why the myth stuck", purpose: "Why we believed the wrong version.", guidance: "Relatable, a little funny.", share: 14 },
      { key: "close", name: "Close", purpose: "What the viewer should picture from now on.", guidance: "Callback to the myth's opening line.", share: 12 },
    ],
  },
];

// Narrated family drama, modelled on Vietnamese "truyện tuổi già" story channels. One chapter = one video (~7–12 min).
// Beats come in three groups: the first chapter, a middle chapter (repeated as many times as the story needs) and the
// last chapter. expandDramaTemplate turns them into c1_…cN_ keys for a story of N chapters.
// Arc: humiliation → hidden secret → reversal → apology → time skip → reconciled meal → moral said out loud.
export const DRAMA_OUTLINE_TEMPLATE: OutlineTemplate = {
  name: "Family drama (chapters)",
  beats: [
    { role: "first", key: "hook", name: "Hook: the whole drama in one breath", purpose: "The very first 1–3 sentences of the video (under 20 seconds): tease the biggest drama of the story, the cruel act, what is at stake and that a twist is coming, without saying how it ends, so the listener has to keep watching.", guidance: "Start with the most shocking image or line, never with a greeting, names or setting. Concrete stakes (an age, an amount, a family betrayal). End on an open question or a 'nhưng không ai ngờ…' line. Example: 'Bảy mươi sáu tuổi, ông bị chính con trai đuổi xuống gầm cầu thang. Nhưng không ai trong nhà biết, trong chiếc hộp gỗ cũ của ông là thứ sẽ khiến cả nhà chết lặng…'", share: 5 },
    { role: "first", key: "cold_open", name: "Cold open: the shouted line", purpose: "Right after the hook, drop the listener into the worst moment: a shouted line of dialogue plus a sound word (Rầm!, Choang!, Cạch).", guidance: "The line that becomes the title. No narrator context yet; 4–8 short sentences of pure scene and dialogue.", share: 12 },
    { role: "first", key: "cast", name: "Who these people are", purpose: "The narrator greets the audience and introduces every key character by full name, age, job and the exact place they live.", guidance: "Specific places (street, district, market), a past job with years, one sensory detail per person.", share: 25 },
    { role: "first", key: "backstory", name: "How it came to this", purpose: "Flash back through 3–4 concrete scenes that built the injustice or the temptation, each with dialogue.", guidance: "Small physical details (rain on a tin roof, an old brown blouse, a ticking clock). Show, don't summarize.", share: 35 },
    { role: "first", key: "hook_cta", name: "First hook + call to action", purpose: "Escalate, hint at a hidden secret or object, then the narrator asks to like, share, comment where they listen from and subscribe, with a blessing.", guidance: "CTA in the channel's address form (e.g. 'quý cô bác'), warm, one paragraph. End on a forward hook ('Họ không hề biết rằng…').", share: 25 },
    { role: "middle", key: "cold_open", name: "Cold open: the next blow", purpose: "Open again on dialogue and a sound: a new consequence or confrontation hits (gossip, a child hurt, a relative calling, a demand).", guidance: "Raise the stakes for the most sympathetic character.", share: 20 },
    { role: "middle", key: "turn", name: "Allies and pressure", purpose: "Someone stands by them or turns against them; a warm or painful concrete scene that moves the plot one step.", guidance: "Food, a meal, a small gesture or a hard word the listener can picture.", share: 30 },
    { role: "middle", key: "reveal", name: "Something comes out", purpose: "A secret, an asset, a debt or a past mistake is revealed in a family scene, with precise figures.", guidance: "Money as exact amounts in words. Let the elder speak with dignity, not revenge.", share: 35 },
    { role: "middle", key: "cliffhanger", name: "Cliffhanger", purpose: "A new blow arrives just as things seem settled (a letter, a phone call, a visitor at the gate).", guidance: "End mid-shock on one short line.", share: 15 },
    { role: "last", key: "cold_open", name: "Cold open: the truth", purpose: "Open on a demand or confession in dialogue; the guilty side explains themselves.", guidance: "Give the antagonist a human reason; keep it fair.", share: 25 },
    { role: "last", key: "reversal", name: "Tables turn", purpose: "The family acts: sacrifices, refusals or help that show who each person really is; the wrongdoer feels the consequence.", guidance: "Concrete acts and amounts. The proud one is humbled by kindness, not humiliation.", share: 35 },
    { role: "last", key: "apology", name: "Apology", purpose: "Kneeling, tears, a symbolic object returned or replaced; forgiveness with conditions.", guidance: "Short lines. Let silence and one gesture carry it.", share: 15 },
    { role: "last", key: "time_skip", name: "One year later", purpose: "A reconciled family meal; callback to an object or line from the cold open.", guidance: "Warm sensory close; show change through small details.", share: 12 },
    { role: "last", key: "moral_cta", name: "Moral + closing CTA", purpose: "The narrator states 2–4 plain lessons (including one practical one, e.g. keep the right to live in the house, keep savings for old age), then asks for likes, comments and subscriptions and blesses the audience.", guidance: "Numbered lessons in simple words; end with a blessing and 'see you in the next story'.", share: 13 },
  ],
};

export const DEFAULT_OUTLINE_TEMPLATE = OUTLINE_TEMPLATES[0];

/** Every built-in template, for the template picker. */
export const ALL_OUTLINE_TEMPLATES: OutlineTemplate[] = [...OUTLINE_TEMPLATES, DRAMA_OUTLINE_TEMPLATE];

/** The structure a channel starts from when it hasn't set its own. */
export function defaultTemplateFor(genre: "explainer" | "drama"): OutlineTemplate {
  return genre === "drama" ? DRAMA_OUTLINE_TEMPLATE : DEFAULT_OUTLINE_TEMPLATE;
}

/** A template whose beats are grouped into first / middle / last chapters. */
export function isChapterTemplate(t: OutlineTemplate): boolean {
  return t.beats.some((b) => b.role);
}

/** Beats of one chapter role. Beats without a role count as middle beats. */
export function beatsOfRole(t: OutlineTemplate, role: ChapterRole): OutlineBeat[] {
  return t.beats.filter((b) => (b.role ?? "middle") === role);
}

/** Which beat group chapter n of a story with `count` chapters uses. */
export function roleOfChapter(n: number, count: number): ChapterRole {
  return n === 1 ? "first" : n === count ? "last" : "middle";
}

/**
 * A chapter template for a story of `count` chapters: chapter 1 = first beats, 2..count-1 = middle beats, count = last beats,
 * with keys prefixed c<n>_ (so a generated outline still knows its chapters). A one-chapter story gets first + last.
 */
export function expandDramaTemplate(t: OutlineTemplate, count: number): OutlineTemplate {
  if (!isChapterTemplate(t)) return t;
  const n = Math.max(1, Math.round(count));
  const beats: OutlineBeat[] = [];
  for (let ch = 1; ch <= n; ch++) {
    const roles: ChapterRole[] = n === 1 ? ["first", "last"] : [roleOfChapter(ch, n)];
    for (const role of roles) {
      for (const b of beatsOfRole(t, role)) beats.push({ ...b, key: `c${ch}_${b.key}`, name: `${ch}. ${b.name}` });
    }
  }
  return { name: `${t.name} × ${n}`, beats };
}

/** Chapter of an outline section, from its key ("c2_reveal" → 2), or null when the outline has no chapters. */
export function chapterOfKey(key: string): number | null {
  const m = /^c(\d+)_/.exec(key);
  return m ? Number(m[1]) : null;
}

/** The template beat an outline section key came from ("c3_reveal" → the "reveal" beat of that chapter's role). */
export function beatOfKey(t: OutlineTemplate, key: string, count: number): OutlineBeat | undefined {
  const ch = chapterOfKey(key);
  if (ch == null) return t.beats.find((b) => b.key === key);
  const base = key.replace(/^c\d+_/, "");
  const roles: ChapterRole[] = count === 1 ? ["first", "last"] : [roleOfChapter(ch, count)];
  return t.beats.find((b) => roles.includes(b.role ?? "middle") && b.key === base);
}
