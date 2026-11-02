import { handler } from "@/lib/api";
import { getActiveChannel } from "@/lib/pipeline/common";
import { createAdProject } from "@/lib/pipeline/product-ad";
import { createProduct } from "@/lib/pipeline/products";

export const dynamic = "force-dynamic";

/**
 * New ad. Either JSON `{ productId, voiceMode }` for a saved product, or multipart with
 * `images` (1–3 files) + `brief` (JSON) + `voiceMode` to save a new product and start its first video.
 */
export const POST = handler(async (req: Request) => {
  if (req.headers.get("content-type")?.includes("application/json")) {
    const b = await req.json();
    return Response.json({ id: createAdProject({ productId: String(b.productId), voiceMode: b.voiceMode }) });
  }
  const form = await req.formData();
  const files = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  const brief = JSON.parse(String(form.get("brief") ?? "{}"));
  const images = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
  const productId = await createProduct(getActiveChannel().id, brief, images);
  return Response.json({ id: createAdProject({ productId, voiceMode: form.get("voiceMode") === "none" ? "none" : "voice" }), productId });
});
