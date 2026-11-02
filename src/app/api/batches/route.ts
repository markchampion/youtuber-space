import { baseUrlOf, handler } from "@/lib/api";
import { startBatch } from "@/lib/pipeline/batch";

export const dynamic = "force-dynamic";

/** Start a batch of product ads that run end to end in parallel. */
export const POST = handler(async (req: Request) => {
  const b = await req.json();
  const projectIds = startBatch(
    {
      productIds: Array.isArray(b.productIds) ? b.productIds.map(String) : [],
      variantsPerProduct: Number(b.variantsPerProduct) || 1,
      voiceMode: b.voiceMode === "none" ? "none" : "voice",
      imageQuality: ["low", "medium", "high"].includes(b.imageQuality) ? b.imageQuality : "medium",
      captions: b.captions !== false,
    },
    baseUrlOf(req),
  );
  return Response.json({ projectIds });
});
