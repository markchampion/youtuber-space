import { handler } from "@/lib/api";
import { addProductPhoto, removeProductPhoto } from "@/lib/pipeline/products";

type Ctx = RouteContext<"/api/products/[id]/photos">;

export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) throw new Error("No file uploaded");
  return Response.json({ path: await addProductPhoto(id, Buffer.from(await file.arrayBuffer())) });
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  removeProductPhoto(id, String(new URL(req.url).searchParams.get("path")));
  return Response.json({ ok: true });
});
