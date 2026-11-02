import "server-only";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { claudeJSON } from "@/lib/ai/claude";
import { channelBrief, evaluatePrompt, ideasPrompt } from "@/lib/ai/prompts";
import { IdeaBatchSchema, IdeaEvaluationSchema, type IdeaEvaluation } from "@/lib/types";
import { slugify } from "@/lib/sync";
import { getChannel } from "./common";

export function listIdeas(channelId: string) {
  return db.select().from(schema.ideas).where(eq(schema.ideas.channelId, channelId)).orderBy(desc(schema.ideas.createdAt)).all();
}

function existingTitles(channelId: string) {
  const ideaTitles = db.select({ t: schema.ideas.title }).from(schema.ideas).where(eq(schema.ideas.channelId, channelId)).all();
  const projectTitles = db.select({ t: schema.projects.title }).from(schema.projects).where(eq(schema.projects.channelId, channelId)).all();
  return [...projectTitles, ...ideaTitles].map((r) => r.t);
}

/**
 * `angleIds`: which of the channel's angles to use. Undefined = all of them, [] = none (the AI invents its own).
 * Ideas that come back with an angle outside the selection are filed as fresh (0).
 */
export async function generateIdeas(
  channelId: string,
  opts: { count?: number; seed?: string; likeTitle?: string; fresh?: boolean; angleIds?: number[] },
) {
  const channel = getChannel(channelId);
  const count = Math.min(Math.max(opts.count ?? 12, 3), 20);
  const angles = Array.isArray(opts.angleIds)
    ? channel.profile.topicAngles.filter((a) => opts.angleIds!.includes(a.id))
    : channel.profile.topicAngles;
  const allowed = new Set(angles.map((a) => a.id));
  const result = env.dryRun
    ? {
        ideas: Array.from({ length: count }, (_, i) => ({
          title: `${opts.seed ? opts.seed + ": " : ""}How Did Ancient Humans Handle Thing #${i + 1}?`,
          angle: !angles.length || (opts.fresh && i % 2) ? 0 : angles[i % angles.length].id,
          hook: "You wake up when your body is ready. No alarm, no schedule.",
          whyViral: "Bridges a universal modern worry to deep history (DRY_RUN placeholder).",
          score: 5 + (i % 5),
        })),
      }
    : await claudeJSON(IdeaBatchSchema, {
        system: channelBrief(channel.profile),
        user: ideasPrompt({ count, seed: opts.seed, likeTitle: opts.likeTitle, fresh: opts.fresh, avoid: existingTitles(channelId), angles }),
        effort: "medium",
        kind: "ideas",
      });
  const rows = result.ideas.map((i) => ({
    id: nanoid(10),
    channelId,
    source: "generated" as const,
    title: i.title,
    angle: allowed.has(i.angle) ? i.angle : 0,
    hook: i.hook,
    whyViral: i.whyViral,
    score: i.score,
  }));
  if (rows.length) db.insert(schema.ideas).values(rows).run();
  return rows;
}

function fakeEvaluation(idea: string, angleIds: number[]): IdeaEvaluation {
  const a = (i: number) => (angleIds.length ? angleIds[i % angleIds.length] : 0);
  return {
    scores: { nicheFit: 8, hookStrength: 6, evidenceDepth: 7, narrativePotential: 7, visualFit: 8, titleClarity: 5 },
    overall: 6.8,
    verdict: "improve",
    closestAngle: a(0),
    summary: `DRY_RUN placeholder evaluation of "${idea}". Strong niche fit; the framing needs a sharper curiosity gap.`,
    strengths: ["Universal topic", "Easy to draw"],
    risks: ["Title is vague", "Needs a named study to anchor it"],
    evidenceLeads: ["Richard Lee's !Kung San fieldwork (1960s)"],
    improvedVersions: [
      { title: `What ${idea} Was Like 50,000 Years Ago`, angle: a(1), hook: "You'd never guess how this worked.", why: "Clearer time anchor" },
      { title: `Why You Wouldn't Survive ${idea} in the Stone Age`, angle: a(2), hook: "You wouldn't last a week.", why: "Immersive POV" },
      { title: `The WEIRDEST Ways Ancient Humans Did ${idea}`, angle: a(3), hook: "Some of these still work.", why: "Superlative curiosity gap" },
    ],
  };
}

export async function evaluateIdea(
  channelId: string,
  opts: { idea: string; notes?: string; feedback?: string; ideaId?: string },
) {
  const channel = getChannel(channelId);
  const previous = opts.ideaId
    ? db.select().from(schema.ideas).where(eq(schema.ideas.id, opts.ideaId)).get()
    : undefined;
  const angles = channel.profile.topicAngles;
  const known = new Set(angles.map((x) => x.id));
  const raw = env.dryRun
    ? fakeEvaluation(opts.idea, angles.map((x) => x.id))
    : await claudeJSON(IdeaEvaluationSchema, {
        system: channelBrief(channel.profile),
        user: evaluatePrompt({
          idea: opts.idea,
          notes: opts.notes,
          feedback: opts.feedback,
          previous: previous?.evaluation ? JSON.stringify(previous.evaluation) : undefined,
          angles,
        }),
        effort: "high",
        kind: "evaluate_idea",
      });
  const fix = (id: number) => (known.has(id) ? id : 0);
  const evaluation: IdeaEvaluation = {
    ...raw,
    closestAngle: fix(raw.closestAngle),
    improvedVersions: raw.improvedVersions.map((v) => ({ ...v, angle: fix(v.angle) })),
  };

  const values = {
    title: opts.idea,
    userNotes: opts.notes ?? null,
    angle: evaluation.closestAngle,
    hook: evaluation.improvedVersions[0]?.hook ?? null,
    whyViral: evaluation.summary,
    score: evaluation.overall,
    evaluation,
  };
  if (previous) {
    // A generated idea keeps its own hook and pitch; only the scorecard is added.
    const update = previous.source === "generated" ? { evaluation, score: evaluation.overall } : values;
    db.update(schema.ideas).set(update).where(eq(schema.ideas.id, previous.id)).run();
    return { ...previous, ...update };
  }
  const row = { id: nanoid(10), channelId, source: "user" as const, ...values };
  db.insert(schema.ideas).values(row).run();
  return row;
}

export function setStar(ideaId: string, starred: boolean) {
  db.update(schema.ideas).set({ starred }).where(eq(schema.ideas.id, ideaId)).run();
}

export function deleteIdea(ideaId: string) {
  db.delete(schema.ideas).where(eq(schema.ideas.id, ideaId)).run();
}

/** Start a project from an idea (optionally using one of its improved versions). */
export function createProject(opts: { ideaId: string; title?: string; angle?: number; hook?: string }) {
  const idea = db.select().from(schema.ideas).where(eq(schema.ideas.id, opts.ideaId)).get();
  if (!idea) throw new Error("Idea not found");
  const title = opts.title ?? idea.title;
  const id = nanoid(10);
  db.insert(schema.projects)
    .values({
      id,
      channelId: idea.channelId,
      ideaId: idea.id,
      title,
      slug: slugify(title),
      angle: opts.angle ?? idea.angle,
      hook: opts.hook ?? idea.hook,
    })
    .run();
  return id;
}
