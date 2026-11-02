import { handler } from "@/lib/api";
import { getChannel } from "@/lib/pipeline/common";
import { removeLogo, setLogo } from "@/lib/pipeline/channels";

/** Upload the active channel's watermark logo (PNG/SVG/JPG; transparent PNG recommended). */
export const POST = handler(async (req: Request) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("No file uploaded");
  if (file.size > 5_000_000) throw new Error("Logo must be under 5 MB");
  await setLogo(getChannel().id, Buffer.from(await file.arrayBuffer()));
  return Response.json({ ok: true });
});

export const DELETE = handler(async () => {
  removeLogo(getChannel().id);
  return Response.json({ ok: true });
});
