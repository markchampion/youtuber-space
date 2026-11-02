import { handler } from "@/lib/api";
import { addLibraryVoice, listVoices, searchLibraryVoices } from "@/lib/tts/elevenlabs";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  if (q.get("library")) {
    return Response.json(
      await searchLibraryVoices({
        language: q.get("language") || "en",
        gender: q.get("gender") ?? undefined,
        search: q.get("search") ?? undefined,
        page: Number(q.get("page") ?? 0) || 0,
        sort: q.get("sort"),
      }),
    );
  }
  return Response.json({ voices: await listVoices() });
});

export const POST = handler(async (req: Request) => {
  const b = await req.json();
  if (b.action !== "addLibrary") throw new Error("Unknown action");
  if (!b.publicOwnerId || !b.voiceId || !b.name) throw new Error("publicOwnerId, voiceId and name are required");
  return Response.json({ voiceId: await addLibraryVoice(String(b.publicOwnerId), String(b.voiceId), String(b.name)) });
});
