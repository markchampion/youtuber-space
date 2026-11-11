import { handler } from "@/lib/api";
import { getChannel } from "@/lib/pipeline/common";
import { generateCharacterCandidates, uploadCharacterRef } from "@/lib/pipeline/images";

/** JSON body: generate 2 AI options. Multipart with `file`: use the user's own image as the reference. */
export const POST = handler(async (req: Request) => {
  const c = getChannel();
  if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) throw new Error("No file uploaded");
    if (file.size > 15_000_000) throw new Error("Image must be under 15 MB");
    const rel = await uploadCharacterRef(c.id, Buffer.from(await file.arrayBuffer()));
    return Response.json({ created: [rel] });
  }
  const created = await generateCharacterCandidates(c.id, 2);
  return Response.json({ created });
});
