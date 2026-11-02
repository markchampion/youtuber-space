import { handler } from "@/lib/api";
import { addProductImage } from "@/lib/pipeline/product-ad";

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/projects/[id]/product">) => {
  const { id } = await ctx.params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("No file uploaded");
  await addProductImage(id, Buffer.from(await file.arrayBuffer()));
  return Response.json({ ok: true });
});
