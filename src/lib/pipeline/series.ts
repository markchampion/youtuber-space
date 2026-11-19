import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { claudeJSON } from "@/lib/ai/claude";
import { channelBrief, seriesPlanPrompt } from "@/lib/ai/prompts";
import { SeriesPlanSchema, type SeriesPlan } from "@/lib/types";
import { slugify } from "@/lib/sync";
import { getChannel } from "./common";
import { startAutopilot } from "./autopilot";

export const MIN_EPISODES = 2;
export const MAX_EPISODES = 10;

/**
 * Multi-episode series: one topic split into N full videos that know about each other.
 * The plan is stored on `series`; each episode becomes a normal project with seriesId + episode,
 * and the outline, script and metadata prompts get the series context added (see seriesBlock).
 */

export function getSeries(id: string) {
  const s = db.select().from(schema.series).where(eq(schema.series.id, id)).get();
  if (!s) throw new Error("Series not found");
  return s;
}

export function listSeries(channelId: string) {
  return db.select().from(schema.series).where(eq(schema.series.channelId, channelId)).orderBy(desc(schema.series.createdAt)).all();
}

/** The series with its episodes' projects (in episode order). */
export function seriesWithEpisodes(id: string) {
  const s = getSeries(id);
  const projects = db
    .select({
      id: schema.projects.id,
      title: schema.projects.title,
      episode: schema.projects.episode,
      approvals: schema.projects.approvals,
      autopilot: schema.projects.autopilot,
      renderPath: schema.projects.renderPath,
    })
    .from(schema.projects)
    .where(eq(schema.projects.seriesId, id))
    .orderBy(asc(schema.projects.episode))
    .all();
  return { ...s, projects };
}

function clampEpisodes(n: number) {
  return Math.max(MIN_EPISODES, Math.min(MAX_EPISODES, Math.round(n) || 3));
}

function existingTitles(channelId: string) {
  return db
    .select({ t: schema.projects.title })
    .from(schema.projects)
    .where(eq(schema.projects.channelId, channelId))
    .all()
    .map((r) => r.t);
}

function fakePlan(topic: string, n: number): SeriesPlan {
  return {
    title: `${topic}: The Series`,
    premise: `A ${n}-part journey through ${topic} (DRY_RUN placeholder).`,
    episodes: Array.from({ length: n }, (_, i) => ({
      title: `${topic} — Chapter ${i + 1}`,
      hook: `Episode ${i + 1} opens here. You won't believe where it starts.`,
      covers: [`Point A of chapter ${i + 1}`, `Point B of chapter ${i + 1}`, `Point C of chapter ${i + 1}`],
      teaser: i < n - 1 ? `Next time: what happened in chapter ${i + 2}.` : "",
    })),
  };
}

/** Ask Claude for a plan and save it as a new (not yet created) series. */
export async function planSeries(channelId: string, opts: { topic: string; episodes: number; ideaId?: string | null }) {
  const topic = opts.topic.trim();
  if (!topic) throw new Error("Enter a topic for the series");
  const channel = getChannel(channelId);
  const n = clampEpisodes(opts.episodes);
  const idea = opts.ideaId ? db.select().from(schema.ideas).where(eq(schema.ideas.id, opts.ideaId)).get() : null;
  const plan = env.dryRun
    ? fakePlan(topic, n)
    : await claudeJSON(SeriesPlanSchema, {
        system: channelBrief(channel.profile),
        user: seriesPlanPrompt({ topic, hook: idea?.hook, episodes: n, avoid: existingTitles(channel.id) }),
        effort: "high",
        kind: "series_plan",
      });
  if (plan.episodes.length < MIN_EPISODES) throw new Error("The plan came back with too few episodes. Try again.");
  const id = nanoid(10);
  db.insert(schema.series)
    .values({ id, channelId: channel.id, ideaId: idea?.id ?? null, title: plan.title, premise: plan.premise, episodes: plan.episodes.slice(0, MAX_EPISODES) })
    .run();
  return getSeries(id);
}

/** Save your edits to the plan. Episodes already created keep their project; their prompts use the new plan. */
export function updateSeriesPlan(id: string, plan: SeriesPlan) {
  const parsed = SeriesPlanSchema.parse(plan);
  const episodes = parsed.episodes.filter((e) => e.title.trim());
  if (episodes.length < MIN_EPISODES) throw new Error(`A series needs at least ${MIN_EPISODES} episodes`);
  const created = seriesWithEpisodes(id).projects.length;
  if (created && episodes.length < created) throw new Error("Episodes already made into videos can't be removed from the plan");
  db.update(schema.series)
    .set({ title: parsed.title.trim() || getSeries(id).title, premise: parsed.premise, episodes: episodes.slice(0, MAX_EPISODES) })
    .where(eq(schema.series.id, id))
    .run();
  return getSeries(id);
}

/**
 * Make a project for every planned episode that doesn't have one yet. With `autopilot`, each new
 * episode starts running with the channel's Autopilot settings (they run in parallel; the shared
 * Claude, image and render limiters keep the load in check).
 */
export function createEpisodes(id: string, opts: { autopilot?: boolean; baseUrl: string }) {
  const s = seriesWithEpisodes(id);
  const have = new Set(s.projects.map((p) => p.episode));
  const created: string[] = [];
  s.episodes.forEach((e, i) => {
    const episode = i + 1;
    if (have.has(episode)) return;
    const pid = nanoid(10);
    db.insert(schema.projects)
      .values({
        id: pid,
        channelId: s.channelId,
        ideaId: s.ideaId,
        title: e.title,
        slug: slugify(`${s.title}-${episode}-${e.title}`),
        hook: e.hook,
        seriesId: id,
        episode,
      })
      .run();
    created.push(pid);
  });
  if (opts.autopilot) for (const pid of created) startAutopilot(pid, opts.baseUrl);
  return created;
}
