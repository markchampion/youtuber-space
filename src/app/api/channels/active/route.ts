import { handler } from "@/lib/api";
import { setActiveChannel } from "@/lib/pipeline/common";

export const POST = handler(async (req: Request) => {
  const { id } = await req.json();
  setActiveChannel(String(id));
  return Response.json({ ok: true });
});
