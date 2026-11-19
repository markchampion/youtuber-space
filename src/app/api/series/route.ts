import { handler } from "@/lib/api";
import { getChannel } from "@/lib/pipeline/common";
import { listSeries, planSeries } from "@/lib/pipeline/series";

export const dynamic = "force-dynamic";

/** The active channel's series, newest first. */
export const GET = handler(async () => Response.json({ series: listSeries(getChannel().id) }));

/** Plan a new series: { topic, episodes, ideaId? }. Returns the saved (not yet created) plan. */
export const POST = handler(async (req: Request) => {
  const b = await req.json();
  const series = await planSeries(getChannel().id, {
    topic: String(b.topic ?? ""),
    episodes: Number(b.episodes) || 3,
    ideaId: typeof b.ideaId === "string" ? b.ideaId : null,
  });
  return Response.json({ series });
});
