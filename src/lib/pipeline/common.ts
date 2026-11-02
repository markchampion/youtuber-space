import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { StepKey } from "@/lib/types";
import { silentTimings } from "@/lib/silent-timing";
import { wordCount } from "@/lib/sync";

const ACTIVE_KEY = "active_channel";

/** The channel used by Ideas, the Channel page and new videos. Falls back to the oldest channel. */
export function getActiveChannel() {
  const id = db.select().from(schema.settings).where(eq(schema.settings.key, ACTIVE_KEY)).get()?.value;
  const c =
    (id && db.select().from(schema.channels).where(eq(schema.channels.id, id)).get()) ||
    db.select().from(schema.channels).orderBy(asc(schema.channels.createdAt)).get();
  if (!c) throw new Error("No channel exists");
  return c;
}

export function setActiveChannel(id: string) {
  getChannel(id);
  db.insert(schema.settings)
    .values({ key: ACTIVE_KEY, value: id })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: id } })
    .run();
}

/** A specific channel, or the active one when no id is given. */
export function getChannel(id?: string | null) {
  if (!id) return getActiveChannel();
  const c = db.select().from(schema.channels).where(eq(schema.channels.id, id)).get();
  if (!c) throw new Error("Channel not found");
  return c;
}

export function getProject(id: string) {
  const p = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!p) throw new Error("Project not found");
  return p;
}

export function updateProject(id: string, values: Partial<typeof schema.projects.$inferInsert>) {
  db.update(schema.projects)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(eq(schema.projects.id, id))
    .run();
}

const ORDER: StepKey[] = ["script", "voice", "scenes", "images", "render", "shorts", "publish"];

/** What each step's output feeds into. Editing a step marks these stale. */
const DOWNSTREAM: Record<StepKey, StepKey[]> = {
  script: ["voice", "scenes", "publish"],
  voice: ["render", "shorts"],
  scenes: ["images", "render", "shorts"],
  images: ["render", "shorts"],
  render: [],
  shorts: [],
  publish: [],
};

export function markChanged(projectId: string, step: StepKey) {
  const p = getProject(projectId);
  const stale = { ...p.stale };
  const approvals = { ...p.approvals };
  // The edited step itself needs re-approval.
  delete approvals[step];
  for (const s of DOWNSTREAM[step]) if (approvals[s]) stale[s] = true;
  updateProject(projectId, { stale, approvals });
}

/** Flag one step as needing another look, without touching other approvals. */
export function markStale(projectId: string, step: StepKey) {
  const p = getProject(projectId);
  if (p.approvals[step]) updateProject(projectId, { stale: { ...p.stale, [step]: true } });
}

export function approveStep(projectId: string, step: StepKey) {
  const p = getProject(projectId);
  const stale = { ...p.stale };
  delete stale[step];
  updateProject(projectId, { approvals: { ...p.approvals, [step]: new Date().toISOString() }, stale });
}

export function stepIndex(step: StepKey) {
  return ORDER.indexOf(step);
}

export function sentencesOf(projectId: string) {
  return db
    .select()
    .from(schema.sentences)
    .where(eq(schema.sentences.projectId, projectId))
    .orderBy(asc(schema.sentences.idx))
    .all();
}

export function paragraphsOf(projectId: string) {
  return db
    .select()
    .from(schema.paragraphs)
    .where(eq(schema.paragraphs.projectId, projectId))
    .orderBy(asc(schema.paragraphs.idx))
    .all();
}

export function scenesOf(projectId: string) {
  return db
    .select()
    .from(schema.scenes)
    .where(eq(schema.scenes.projectId, projectId))
    .orderBy(asc(schema.scenes.idx))
    .all();
}

/** Silent ads: each sentence stays on screen for its reading time. Sets the "audio" length the timeline uses. */
export function applySilentTiming(projectId: string) {
  const locale = getChannel(getProject(projectId).channelId).profile.language;
  const sentences = sentencesOf(projectId);
  const times = silentTimings(sentences.map((s) => wordCount(s.text, locale)));
  db.transaction((tx) => {
    sentences.forEach((s, i) => tx.update(schema.sentences).set(times[i]).where(eq(schema.sentences.id, s.id)).run());
  });
  updateProject(projectId, { audioPath: null, audioDuration: times.at(-1)?.end ?? 0 });
  markStale(projectId, "render");
}
