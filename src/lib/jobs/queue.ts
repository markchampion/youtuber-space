import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import pLimit from "p-limit";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";

export type JobCtx = {
  id: string;
  progress: (fraction: number, message?: string) => void;
};

const g = globalThis as unknown as {
  __imageLimit?: ReturnType<typeof pLimit>;
  __renderLimit?: ReturnType<typeof pLimit>;
  __claudeLimit?: ReturnType<typeof pLimit>;
  __jobPromises?: Map<string, Promise<void>>;
};
/** Jobs started by this process, so other code (Autopilot) can await them. */
const promises = (g.__jobPromises ??= new Map());
/** Shared limiter so parallel image jobs never exceed the configured concurrency. */
const limiter = (g.__imageLimit ??= pLimit(4));
export function imageLimit<T>(fn: () => Promise<T>): Promise<T> {
  limiter.concurrency = env.imageConcurrency; // picks up changes from Settings
  return limiter(fn);
}

/** Video renders each start a headless Chrome: run at most RENDER_CONCURRENCY at once, queue the rest. */
const renders = (g.__renderLimit ??= pLimit(1));
export function renderLimit<T>(fn: () => Promise<T>): Promise<T> {
  renders.concurrency = env.renderConcurrency;
  return renders(fn);
}

/** Batches start many videos at once; keep Claude calls for them under the API / CLI rate limits. */
const claudeCalls = (g.__claudeLimit ??= pLimit(3));
export function claudeLimit<T>(fn: () => Promise<T>): Promise<T> {
  return claudeCalls(fn);
}

/** Jobs of this kind that are waiting for or holding a render slot. */
export const renderQueue = () => ({ active: renders.activeCount, waiting: renders.pendingCount });

/**
 * Run `fn` in the background, tracked in the jobs table (UI polls it).
 * If the same job type is already running for the project, returns that job.
 */
export function startJob(projectId: string | null, type: string, fn: (ctx: JobCtx) => Promise<void>): string {
  if (projectId) {
    const running = db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.projectId, projectId), eq(schema.jobs.type, type), eq(schema.jobs.status, "running")))
      .get();
    if (running) return running.id;
  }
  const id = nanoid(10);
  db.insert(schema.jobs).values({ id, projectId, type, status: "running", progress: 0, owner: process.pid }).run();
  const ctx: JobCtx = {
    id,
    progress: (fraction, message) =>
      db
        .update(schema.jobs)
        .set({ progress: Math.max(0, Math.min(1, fraction)), ...(message ? { message } : {}) })
        .where(eq(schema.jobs.id, id))
        .run(),
  };
  const run = (async () => {
    try {
      await fn(ctx);
      db.update(schema.jobs)
        .set({ status: "done", progress: 1, finishedAt: new Date().toISOString() })
        .where(eq(schema.jobs.id, id))
        .run();
    } catch (e) {
      console.error(`[job ${type}]`, e);
      db.update(schema.jobs)
        .set({ status: "error", error: e instanceof Error ? e.message : String(e), finishedAt: new Date().toISOString() })
        .where(eq(schema.jobs.id, id))
        .run();
      throw e;
    } finally {
      // Keep it briefly so a waiter that arrives just after the end still finds it.
      setTimeout(() => promises.delete(id), 60_000);
    }
  })();
  run.catch(() => {}); // errors are recorded in the jobs table; waiters get them via waitForJob
  promises.set(id, run);
  return id;
}

/** Resolve when the job finishes; throw its error if it failed. Works for jobs from other processes by polling. */
export async function waitForJob(id: string): Promise<void> {
  const p = promises.get(id);
  if (p) return p;
  for (;;) {
    const j = db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).get();
    if (!j) throw new Error("Job not found");
    if (j.status === "done") return;
    if (j.status === "error") throw new Error(j.error ?? "Job failed");
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export function runningJobOf(projectId: string, type: string) {
  return db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.projectId, projectId), eq(schema.jobs.type, type), eq(schema.jobs.status, "running")))
    .get();
}

export function recentJobs(projectId: string, limit = 10) {
  return db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.projectId, projectId))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(limit)
    .all();
}
