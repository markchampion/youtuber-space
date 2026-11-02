import { handler } from "@/lib/api";
import { getChannel } from "@/lib/pipeline/common";
import { createProject, deleteIdea, evaluateIdea, generateIdeas, listIdeas, setStar } from "@/lib/pipeline/ideas";

export const dynamic = "force-dynamic";

export const GET = handler(async () => Response.json({ ideas: listIdeas(getChannel().id) }));

export const POST = handler(async (req: Request) => {
  const body = await req.json();
  const channelId = getChannel().id;
  switch (body.action) {
    case "generate":
      return Response.json({ ideas: await generateIdeas(channelId, body) });
    case "evaluate":
      if (!body.idea?.trim()) throw new Error("Write an idea first");
      return Response.json({ idea: await evaluateIdea(channelId, body) });
    case "star":
      setStar(body.ideaId, Boolean(body.starred));
      return Response.json({ ok: true });
    case "delete":
      deleteIdea(body.ideaId);
      return Response.json({ ok: true });
    case "start":
      return Response.json({ projectId: createProject(body) });
    default:
      throw new Error(`Unknown action ${body.action}`);
  }
});
