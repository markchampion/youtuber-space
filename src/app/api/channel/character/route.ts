import { handler } from "@/lib/api";
import { getChannel } from "@/lib/pipeline/common";
import { generateCharacterCandidates } from "@/lib/pipeline/images";

export const POST = handler(async () => {
  const c = getChannel();
  const created = await generateCharacterCandidates(c.id, 2);
  return Response.json({ created });
});
