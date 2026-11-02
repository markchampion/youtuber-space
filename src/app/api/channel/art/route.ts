import { handler } from "@/lib/api";
import { getChannel } from "@/lib/pipeline/common";
import { avatarAsLogo, deleteChannelArt, generateChannelArt, setChannelArt } from "@/lib/pipeline/channel-art";
import type { ChannelArtKind } from "@/lib/ai/prompts/channel-art";

const kindOf = (v: unknown): ChannelArtKind => (v === "banner" ? "banner" : "avatar");

/** Generate options (`{ kind, withName }`), or `{ action: "useAsLogo" }` to make the avatar the watermark logo. */
export const POST = handler(async (req: Request) => {
  const b = await req.json();
  const c = getChannel();
  if (b.action === "useAsLogo") return Response.json({ logoPath: await avatarAsLogo(c.id) });
  return Response.json({ created: await generateChannelArt(c.id, kindOf(b.kind), { withName: b.withName !== false }) });
});

/** Pick an option (`path: null` clears the pick). */
export const PUT = handler(async (req: Request) => {
  const b = await req.json();
  setChannelArt(getChannel().id, kindOf(b.kind), b.path ? String(b.path) : null);
  return Response.json({ ok: true });
});

export const DELETE = handler(async (req: Request) => {
  deleteChannelArt(getChannel().id, String(new URL(req.url).searchParams.get("path")));
  return Response.json({ ok: true });
});
