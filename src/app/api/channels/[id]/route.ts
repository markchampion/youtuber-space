import { handler } from "@/lib/api";
import { deleteChannel } from "@/lib/pipeline/channels";

export const DELETE = handler(async (_req: Request, ctx: RouteContext<"/api/channels/[id]">) => {
  const { id } = await ctx.params;
  deleteChannel(id);
  return Response.json({ ok: true });
});
