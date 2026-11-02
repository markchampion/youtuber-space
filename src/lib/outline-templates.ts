import type { OutlineTemplate } from "./channel";

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

export const DEFAULT_OUTLINE_TEMPLATE = OUTLINE_TEMPLATES[0];
