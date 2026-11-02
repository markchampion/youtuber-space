import { handler } from "@/lib/api";
import { publicSettings, saveSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const GET = handler(async () => Response.json({ settings: publicSettings() }));

export const PUT = handler(async (req: Request) => {
  const body = await req.json();
  saveSettings(body.values ?? {});
  return Response.json({ settings: publicSettings() });
});
