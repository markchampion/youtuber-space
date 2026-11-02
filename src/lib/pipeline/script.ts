import "server-only";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { claudeJSON, claudeText } from "@/lib/ai/claude";
import { channelBrief, factCheckPrompt, outlinePrompt, polishPrompt, rewriteParagraphPrompt, scriptPrompt, shortenPrompt, templateOf, trimPrompt } from "@/lib/ai/prompts";
import { OUTLINE_TEMPLATES } from "@/lib/outline-templates";
import type { ChannelProfile, OutlineTemplate } from "@/lib/channel";
import { lengthBudget, needsTrim, polishEnabled } from "@/lib/channel";
import { FactCheckSchema, OutlineSchema, type FactCheck, type Outline } from "@/lib/types";
import { acceptPolish, splitParagraphs, splitSentences, wordCount } from "@/lib/sync";
import { getVersion, recordVersion, snapshotCurrent } from "./history";
import type { VersionSource } from "@/lib/history-rules";
import { applySilentTiming, approveStep, getChannel, getProject, markChanged, paragraphsOf, scenesOf, updateProject } from "./common";

const DRY_OUTLINE: Outline = {
  sections: [
    { key: "hook", title: "Hook", beats: ["You wake up when your body is ready.", "No alarm. No schedule."] },
    { key: "reframe", title: "Reframe", beats: ["For 99% of human history, this was normal."] },
    { key: "evidence", title: "Evidence stack", beats: ["Richard Lee's !Kung San fieldwork", "Skeletal evidence"] },
    { key: "scene", title: "Reconstructed scene", beats: ["A day at the camp, hour by hour"] },
    { key: "twist", title: "Twist", beats: ["Agriculture made days longer, not shorter"] },
    { key: "mirror", title: "Modern mirror", beats: ["Your alarm clock"] },
    { key: "close", title: "Close", beats: ["You wake up when the alarm is ready."] },
  ],
  evidence: ["Richard Lee (1960s !Kung San studies)", "James Suzman", "Chauvet Cave"],
};

const DRY_SCRIPT = `You wake up when your body is ready. No alarm. No schedule. No place you need to be. For ninety-nine percent of human history, this was not a fantasy.

It was every single morning. For roughly three hundred thousand years, your ancestors rose with the light. What did they do next?

In the nineteen sixties, the anthropologist Richard Lee lived with the Ju/'hoansi of the Kalahari. He counted the hours they spent finding food. The answer surprised everyone.

So let's reconstruct a day. The fire is still warm. Someone is already laughing. You stretch, and you listen.

Then came farming. It promised plenty. It delivered longer days, smaller bodies, and new diseases.

Tomorrow morning, an alarm will pull you out of sleep. You wake up when the alarm is ready.`;

/** A built-in template by name, or the channel's own template. */
export function resolveTemplate(profile: ChannelProfile, name?: string | null): OutlineTemplate {
  const own = templateOf(profile);
  if (!name || name === own.name) return own;
  return OUTLINE_TEMPLATES.find((t) => t.name === name) ?? own;
}

export async function generateOutline(projectId: string, templateName?: string | null) {
  snapshotCurrent(projectId, "outline"); // keep what's there before the AI replaces it
  const p = getProject(projectId);
  const channel = getChannel(p.channelId);
  const template = resolveTemplate(channel.profile, templateName);
  const outline = env.dryRun
    ? DRY_OUTLINE
    : await claudeJSON(OutlineSchema, {
        system: channelBrief(channel.profile),
        user: outlinePrompt(channel.profile, p.title, p.hook, template),
        effort: "high",
        kind: "outline",
        projectId,
      });
  updateProject(projectId, { outline });
  recordVersion(projectId, "outline", JSON.stringify(outline), "ai");
  return outline;
}

export function saveOutline(projectId: string, outline: Outline, source: VersionSource = "edit") {
  updateProject(projectId, { outline });
  recordVersion(projectId, "outline", JSON.stringify(outline), source);
}

/** Streams the script; `onText` receives deltas. Saves when complete. */
export async function generateScript(projectId: string, onText: (d: string) => void) {
  const p = getProject(projectId);
  if (!p.outline) throw new Error("Generate or write an outline first");
  snapshotCurrent(projectId, "script"); // keep the previous script before the AI replaces it
  const channel = getChannel(p.channelId);
  let script: string;
  if (env.dryRun) {
    for (const word of DRY_SCRIPT.split(/(?<=\s)/)) {
      onText(word);
      await new Promise((r) => setTimeout(r, 8));
    }
    script = DRY_SCRIPT;
  } else {
    script = await claudeText({
      system: channelBrief(channel.profile),
      user: scriptPrompt(channel.profile, p.title, p.outline),
      effort: "high",
      maxTokens: 64000,
      kind: "script",
      projectId,
      onText,
    });
  }
  saveScript(projectId, script, "ai");
  if (polishEnabled(channel.profile)) {
    // Tell the client a second pass is starting; it replaces the text it shows.
    onText(POLISH_MARKER);
    script = (await polishScript(projectId, onText)).script;
  }
  // Models can't count while writing: if the draft is clearly over the channel's length, cut it down.
  if (!env.dryRun && needsTrim(wordCount(script, channel.profile.language), lengthBudget(channel.profile))) {
    onText(POLISH_MARKER);
    script = (await rewriteWholeScript(projectId, "trim", onText)).script;
  }
  return script;
}

/** Stream marker between the first draft and the natural-speech pass. */
export const POLISH_MARKER = "\n[[POLISH]]\n";

/**
 * Whole-script rewrite passes (facts and paragraphs unchanged):
 * "polish" makes it sound spoken, "shorten" splits sentences over the channel's word limit,
 * "trim" cuts the script down to the channel's length (it may drop whole paragraphs).
 * Saved as its own "Rewrite" version, so the previous draft stays in History.
 */
export type RewriteMode = "polish" | "shorten" | "trim";

const REWRITE_NOTES: Record<RewriteMode, string> = {
  polish: "natural speech pass",
  shorten: "shortened long sentences",
  trim: "trimmed to the channel length",
};

export async function rewriteWholeScript(projectId: string, mode: RewriteMode, onText: (d: string) => void) {
  const p = getProject(projectId);
  if (!p.script?.trim()) throw new Error("Write the script first");
  const channel = getChannel(p.channelId);
  let result: string;
  if (env.dryRun) {
    result = p.script;
    for (const chunk of result.split(/(?<=\s)/)) onText(chunk);
  } else {
    result = await claudeText({
      system: channelBrief(channel.profile),
      user:
        mode === "polish"
          ? polishPrompt(channel.profile, p.script)
          : mode === "shorten"
            ? shortenPrompt(channel.profile, p.script)
            : trimPrompt(channel.profile, p.script, wordCount(p.script, channel.profile.language)),
      effort: mode === "polish" ? "high" : "medium",
      maxTokens: 64000,
      kind: "polish",
      projectId,
      onText,
    });
  }
  if (mode === "trim") {
    if (!splitParagraphs(result).length) throw new Error("The trim came back empty, so it was discarded. The previous script is kept.");
  } else if (!acceptPolish(p.script, result)) {
    // Paragraphs map 1:1 to voice clips, so a restructured result is discarded.
    throw new Error("The rewrite changed the paragraph structure, so it was discarded. The previous script is kept.");
  }
  saveScript(projectId, result, "rewrite", REWRITE_NOTES[mode]);
  return { script: result };
}

export const polishScript = (projectId: string, onText: (d: string) => void) => rewriteWholeScript(projectId, "polish", onText);

export function saveScript(projectId: string, script: string, source: VersionSource = "edit", note?: string) {
  const p = getProject(projectId);
  if (p.script === script) return;
  updateProject(projectId, { script, factChecks: null });
  recordVersion(projectId, "script", script, source, note);
  markChanged(projectId, "script");
}

/** Bring back an earlier version. Nothing is deleted: the restore becomes the newest version. */
export function restoreVersion(projectId: string, versionId: string) {
  const v = getVersion(versionId);
  if (v.projectId !== projectId) throw new Error("Version belongs to another video");
  if (v.kind === "script") saveScript(projectId, v.content, "restore");
  else saveOutline(projectId, JSON.parse(v.content) as Outline, "restore");
}

export async function rewriteParagraph(projectId: string, paragraph: string, instruction: string) {
  const p = getProject(projectId);
  const channel = getChannel(p.channelId);
  if (env.dryRun) return paragraph.replace(/\.$/, "") + ". (rewritten)";
  return claudeText({
    system: channelBrief(channel.profile),
    user: rewriteParagraphPrompt(p.script ?? "", paragraph, instruction),
    effort: "medium",
    maxTokens: 4000,
    kind: "rewrite",
    projectId,
  });
}

export async function factCheck(projectId: string) {
  const p = getProject(projectId);
  if (!p.script) throw new Error("No script yet");
  const checks: FactCheck[] = env.dryRun
    ? [
        { name: "Richard Lee", claim: "Lived with the Ju/'hoansi in the 1960s", confidence: "high", note: "Well documented." },
        { name: "300,000 years", claim: "Age of Homo sapiens", confidence: "medium", note: "Jebel Irhoud dating ~300k years; OK as 'roughly'." },
      ]
    : (
        await claudeJSON(FactCheckSchema, {
          system: "You are a meticulous fact-checker for educational history videos.",
          user: factCheckPrompt(p.script),
          effort: "high",
          kind: "fact_check",
          projectId,
        })
      ).claims;
  updateProject(projectId, { factChecks: checks });
  return checks;
}

export function setFactVerified(projectId: string, index: number, verified: boolean) {
  const p = getProject(projectId);
  const checks = [...(p.factChecks ?? [])];
  if (checks[index]) checks[index] = { ...checks[index], verified };
  updateProject(projectId, { factChecks: checks });
}

/**
 * Approving the script (re)builds paragraphs and sentences. Paragraphs whose
 * text is unchanged keep their generated audio, so only edited parts get re-voiced.
 */
export function approveScript(projectId: string) {
  const p = getProject(projectId);
  if (!p.script?.trim()) throw new Error("Script is empty");
  const texts = splitParagraphs(p.script);
  const locale = getChannel(p.channelId).profile.language ?? "en";
  const old = paragraphsOf(projectId);
  const oldByText = new Map(old.map((o) => [o.text, o]));

  const sentenceRows: (typeof schema.sentences.$inferInsert)[] = [];
  let g = 0;
  const paragraphRows = texts.map((text, idx) => {
    const reuse = oldByText.get(text);
    oldByText.delete(text);
    for (const s of splitSentences(text, locale)) {
      sentenceRows.push({ id: nanoid(12), projectId, paragraphIdx: idx, idx: g++, text: s.text });
    }
    return reuse
      ? { ...reuse, idx }
      : { id: nanoid(10), projectId, idx, text, status: "pending" as const };
  });

  const unchanged = old.length === texts.length && old.every((o, i) => o.text === texts[i]);
  db.transaction((tx) => {
    tx.delete(schema.paragraphs).where(eq(schema.paragraphs.projectId, projectId)).run();
    tx.delete(schema.sentences).where(eq(schema.sentences.projectId, projectId)).run();
    if (paragraphRows.length) tx.insert(schema.paragraphs).values(paragraphRows).run();
    if (sentenceRows.length) tx.insert(schema.sentences).values(sentenceRows).run();
  });
  approveStep(projectId, "script");
  // Silent product ads: no voice step, so timings come from reading pace right away.
  if (p.voiceMode === "none") {
    applySilentTiming(projectId);
    if (!unchanged && scenesOf(projectId).length) updateProject(projectId, { stale: { ...getProject(projectId).stale, scenes: true } });
    return;
  }
  if (!unchanged) {
    // Sentence indices may have shifted; voice needs re-stitching and scenes re-planning.
    updateProject(projectId, { audioPath: null, audioDuration: null });
    markChanged(projectId, "voice");
    if (scenesOf(projectId).length) {
      updateProject(projectId, { stale: { ...getProject(projectId).stale, scenes: true } });
    }
  }
}
