import { POLISH_MARKER, generateScript, rewriteWholeScript } from "@/lib/pipeline/script";

/**
 * Streams the script as plain text while Claude writes it. `?mode=polish` streams only the
 * natural-speech pass over the current script, `?mode=shorten` / `?mode=trim` the other rewrites. The polish phase always starts with POLISH_MARKER.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/script-stream">) {
  const { id } = await ctx.params;
  const mode = new URL(req.url).searchParams.get("mode");
  const rewriteMode = mode === "polish" || mode === "shorten" || mode === "trim" ? mode : null;
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (d: string) => controller.enqueue(enc.encode(d));
      try {
        if (rewriteMode) {
          send(POLISH_MARKER);
          await rewriteWholeScript(id, rewriteMode, send);
        } else {
          await generateScript(id, send);
        }
      } catch (e) {
        // A sentinel the client recognises; the saved script is reloaded client-side.
        send(`\n\n[[ERROR]] ${e instanceof Error ? e.message : String(e)}`);
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
