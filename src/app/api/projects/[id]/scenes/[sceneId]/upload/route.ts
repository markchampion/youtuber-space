import { handler } from "@/lib/api";
import { uploadSceneImage } from "@/lib/pipeline/images";

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/projects/[id]/scenes/[sceneId]/upload">) => {
  const { sceneId } = await ctx.params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("No file uploaded");
  await uploadSceneImage(sceneId, Buffer.from(await file.arrayBuffer()));
  return Response.json({ ok: true });
});
