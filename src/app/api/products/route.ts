import { handler } from "@/lib/api";
import { getActiveChannel } from "@/lib/pipeline/common";
import { createProduct, deleteProduct, listProducts, updateProduct } from "@/lib/pipeline/products";

export const dynamic = "force-dynamic";

/** The active channel's saved products. */
export const GET = handler(async () => Response.json({ products: listProducts(getActiveChannel().id) }));

/** Multipart: `images` (1–3 files) + `brief` (JSON: name, sellingPoints[], cta, audience?, price?). */
export const POST = handler(async (req: Request) => {
  const form = await req.formData();
  const files = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  const images = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
  return Response.json({ id: await createProduct(getActiveChannel().id, JSON.parse(String(form.get("brief") ?? "{}")), images) });
});

export const PUT = handler(async (req: Request) => {
  const b = await req.json();
  return Response.json({ product: updateProduct(String(b.id), b.brief ?? {}) });
});

export const DELETE = handler(async (req: Request) => {
  deleteProduct(String(new URL(req.url).searchParams.get("id")));
  return Response.json({ ok: true });
});
