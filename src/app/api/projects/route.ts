import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handler } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import { projectCost } from "@/lib/costs";
import { getActiveChannel, scenesOf } from "@/lib/pipeline/common";
import { autopilotState } from "@/lib/pipeline/autopilot";
import { channelKind } from "@/lib/channel";

export const dynamic = "force-dynamic";

/** `?channel=all` lists every channel's videos; otherwise only the active channel's. */
export const GET = handler(async (req: Request) => {
  const all = new URL(req.url).searchParams.get("channel") === "all";
  const active = getActiveChannel();
  const rows = db
    .select()
    .from(schema.projects)
    .where(all ? undefined : eq(schema.projects.channelId, active.id))
    .orderBy(desc(schema.projects.updatedAt))
    .all();
  const running = new Map(
    db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, "running"))
      .all()
      .filter((j) => j.projectId && j.type !== "autopilot")
      .map((j) => [j.projectId!, { type: j.type.split(":")[0], progress: j.progress, message: j.message }]),
  );
  const channels = new Map(db.select().from(schema.channels).all().map((c) => [c.id, { name: c.name, kind: channelKind(c.profile) }]));
  return Response.json({
    channel: { id: active.id, name: active.name, kind: channelKind(active.profile) },
    projects: rows.map((p) => {
      // Ads show the product photo until the first scene image exists.
      const cover = scenesOf(p.id).find((s) => s.imagePath) ?? (p.product?.imagePaths[0] ? { imagePath: p.product.imagePaths[0] } : undefined);
      return {
        id: p.id,
        title: p.title,
        channelName: channels.get(p.channelId)?.name ?? "",
        kind: channels.get(p.channelId)?.kind ?? "longform",
        voiceMode: p.voiceMode,
        productId: p.productId,
        // Live progress for the list (batches run many videos at once).
        autopilot: p.autopilot ? { status: autopilotState(p.id)?.interrupted ? "error" : p.autopilot.status, step: p.autopilot.step, error: p.autopilot.error ?? null } : null,
        job: running.get(p.id) ?? null,
        approvals: p.approvals,
        stale: p.stale,
        audioDuration: p.audioDuration,
        rendered: Boolean(p.renderPath),
        updatedAt: p.updatedAt,
        cost: projectCost(p.id),
        coverUrl: mediaUrl(cover?.imagePath),
      };
    }),
  });
});
