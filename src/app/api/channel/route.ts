import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handler } from "@/lib/api";
import { normalizeProfile } from "@/lib/channel-normalize";
import { DEFAULT_BRANDING, pacingOf } from "@/lib/channel";
import { saveBranding } from "@/lib/pipeline/channels";
import { keyStatus } from "@/lib/env";
import { getChannel } from "@/lib/pipeline/common";
import { characterCandidates, setCharacterRef } from "@/lib/pipeline/images";
import { mediaUrl } from "@/lib/media";
import { channelArt } from "@/lib/pipeline/channel-art";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const c = getChannel();
  return Response.json({
    channel: c,
    characterRefUrl: mediaUrl(c.characterRefPath),
    branding: { ...DEFAULT_BRANDING, ...(c.branding ?? {}) },
    logoUrl: mediaUrl(c.branding?.logoPath),
    candidates: characterCandidates(c.id).map((rel) => ({ rel, url: mediaUrl(rel) })),
    art: channelArt(c.id),
    keys: keyStatus(),
  });
});

export const PUT = handler(async (req: Request) => {
  const body = await req.json();
  const c = getChannel(body.id);
  const values: Partial<typeof schema.channels.$inferInsert> = {};
  if (body.profile) {
    values.profile = normalizeProfile(body.profile);
    values.name = values.profile.name;
  }
  if ("voiceId" in body) values.voiceId = body.voiceId;
  if (body.voiceSettings) values.voiceSettings = body.voiceSettings;
  // A different voice or speed speaks at a different pace: forget the old measurement.
  const voiceChanged = "voiceId" in body && body.voiceId !== c.voiceId;
  const speedChanged = body.voiceSettings && body.voiceSettings.speed !== (c.voiceSettings?.speed ?? 1);
  if (voiceChanged || speedChanged) {
    const base = values.profile ?? c.profile;
    const pacing = { ...pacingOf(base) };
    delete pacing.measuredWpm;
    values.profile = normalizeProfile({ ...base, pacing });
  }
  if (body.pronunciations) values.pronunciations = body.pronunciations;
  if (Object.keys(values).length) db.update(schema.channels).set(values).where(eq(schema.channels.id, c.id)).run();
  if ("characterRefPath" in body) setCharacterRef(c.id, body.characterRefPath);
  if (body.branding) saveBranding(c.id, body.branding);
  return Response.json({ ok: true });
});
