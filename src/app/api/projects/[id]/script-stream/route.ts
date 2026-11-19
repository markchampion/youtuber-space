import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handler } from "@/lib/api";
import { startJob } from "@/lib/jobs/queue";
import { getProject } from "@/lib/pipeline/common";
import { POLISH_MARKER, generateScript, rewriteWholeScript } from "@/lib/pipeline/script";

export const dynamic = "force-dynamic";

/**
 * Script writing runs as a background "script" job, so it keeps going when you leave the page.
 * The job stores everything Claude has written so far in jobs.output, in the same format the old
 * live stream used: `?mode=polish` / `shorten` / `trim` start with POLISH_MARKER, each follow-up pass
 * of a full write starts with POLISH_MARKER, drama stories send a chapter marker (see chapterMarker)
 * before each chapter, and a failure ends with `[[ERROR]] message`. `?mode=continue` resumes a story
 * from its first missing chapter. The Script page polls GET to show the text and to reattach.
 */
const JOB = "script";
const MODES = ["write", "continue", "polish", "shorten", "trim"] as const;
type Mode = (typeof MODES)[number];

/** Start writing (or return the job already running for this video). */
export const POST = handler(async (req: Request, ctx: RouteContext<"/api/projects/[id]/script-stream">) => {
  const { id } = await ctx.params;
  getProject(id);
  const q = new URL(req.url).searchParams.get("mode");
  const mode: Mode = (MODES as readonly string[]).includes(q ?? "") ? (q as Mode) : "write";

  const jobId = startJob(id, JOB, async (job) => {
    let out = "";
    let dirty = false;
    const flush = () => {
      if (!dirty) return;
      dirty = false;
      db.update(schema.jobs).set({ output: out }).where(eq(schema.jobs.id, job.id)).run();
    };
    // Write to the database at most twice a second; the page polls about once a second.
    const timer = setInterval(flush, 500);
    const send = (d: string) => {
      out += d;
      dirty = true;
    };
    job.progress(0, mode); // the mode, so a page that reattaches knows which pass this is
    try {
      if (mode === "polish" || mode === "shorten" || mode === "trim") {
        send(POLISH_MARKER);
        await rewriteWholeScript(id, mode, send);
      } else {
        await generateScript(id, send, { resume: mode === "continue" });
      }
    } catch (e) {
      send(`\n\n[[ERROR]] ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    } finally {
      clearInterval(timer);
      dirty = true;
      flush();
    }
  });
  return Response.json({ jobId });
});

/** The newest script job of this video, with its text so far. `job` is null if there never was one. */
export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/projects/[id]/script-stream">) => {
  const { id } = await ctx.params;
  const job = db
    .select({
      id: schema.jobs.id,
      status: schema.jobs.status,
      mode: schema.jobs.message,
      output: schema.jobs.output,
      error: schema.jobs.error,
      createdAt: schema.jobs.createdAt,
    })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.projectId, id), eq(schema.jobs.type, JOB)))
    .orderBy(desc(schema.jobs.createdAt))
    .get();
  return Response.json({ job: job ?? null }, { headers: { "Cache-Control": "no-store" } });
});
