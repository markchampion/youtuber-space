import { handler } from "@/lib/api";
import { analyzeTranscript, createChannel, draftChannel, listChannels, rewriteSection } from "@/lib/pipeline/channels";

export const dynamic = "force-dynamic";

export const GET = handler(async () => Response.json({ channels: listChannels() }));

export const POST = handler(async (req: Request) => {
  const b = await req.json();
  switch (b.action) {
    case "draft":
      return Response.json({ profile: await draftChannel(b) });
    case "rewrite":
      return Response.json({ profile: await rewriteSection(b.profile, b.section, String(b.instruction ?? "")) });
    case "analyzeTranscript":
      return Response.json(await analyzeTranscript(b.profile, String(b.transcript ?? "")));
    case "create":
      return Response.json({ id: createChannel(b.profile) });
    default:
      throw new Error(`Unknown action ${b.action}`);
  }
});
