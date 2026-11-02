import { handler } from "@/lib/api";
import { getProject } from "@/lib/pipeline/common";
import { exportPrompts } from "@/lib/pipeline/scenes";
import { buildProjectSrt } from "@/lib/pipeline/render";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/projects/[id]/export">) => {
  const { id } = await ctx.params;
  const type = new URL(req.url).searchParams.get("type");
  const p = getProject(id);
  const [name, body] =
    type === "script"
      ? [`script_${p.slug}.txt`, p.script ?? ""]
      : type === "prompts"
        ? [`image_prompts_${p.slug}.txt`, exportPrompts(id)]
        : type === "srt"
          ? [`${p.slug}.srt`, buildProjectSrt(id)]
          : type === "metadata"
            ? [`metadata_${p.slug}.txt`, p.metadata ? `${p.metadata.titles[0]}\n\n${p.metadata.description}\n\n${p.metadata.tags.join(", ")}\n` : ""]
            : (() => {
                throw new Error("Unknown export type");
              })();
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
});
