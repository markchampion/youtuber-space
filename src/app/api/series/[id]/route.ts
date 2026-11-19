import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { baseUrlOf, handler } from "@/lib/api";
import { createEpisodes, getSeries, seriesWithEpisodes, updateSeriesPlan } from "@/lib/pipeline/series";

export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/series/[id]">;

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return Response.json({ series: seriesWithEpisodes(id) });
});

/** { action: "update", plan } | { action: "create", autopilot? } */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await req.json();
  switch (b.action) {
    case "update":
      return Response.json({ series: updateSeriesPlan(id, b.plan) });
    case "create":
      return Response.json({ projectIds: createEpisodes(id, { autopilot: Boolean(b.autopilot), baseUrl: baseUrlOf(req) }) });
    default:
      throw new Error(`Unknown action ${b.action}`);
  }
});

/** Delete the plan. Episode videos stay, as standalone videos. */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  getSeries(id);
  db.update(schema.projects).set({ seriesId: null, episode: null }).where(eq(schema.projects.seriesId, id)).run();
  db.delete(schema.series).where(eq(schema.series.id, id)).run();
  return Response.json({ ok: true });
});
