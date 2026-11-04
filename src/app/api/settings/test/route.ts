import Anthropic from "@anthropic-ai/sdk";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import OpenAI from "openai";
import { handler } from "@/lib/api";
import { env, modelFor } from "@/lib/env";
import { cliPing } from "@/lib/ai/claude-cli";
import { codexPing } from "@/lib/ai/codex-text";
import { CodexImageProvider } from "@/lib/image/codex";

/** Checks the saved key with a cheap, read-only call (no generation, no cost). */
export const POST = handler(async (req: Request) => {
  const { provider } = await req.json();
  try {
    switch (provider) {
      case "ANTHROPIC_API_KEY": {
        if (!env.anthropicKey) throw new Error("No key set");
        const m = await new Anthropic({ apiKey: env.anthropicKey, maxRetries: 0 }).models.retrieve(modelFor("script"));
        return Response.json({ ok: true, message: `Connected. ${m.display_name} is available.` });
      }
      case "ELEVENLABS_API_KEY": {
        if (!env.elevenLabsKey) throw new Error("No key set");
        const res = await new ElevenLabsClient({ apiKey: env.elevenLabsKey, maxRetries: 0 }).voices.getAll();
        return Response.json({ ok: true, message: `Connected. ${res.voices.length} voices available.` });
      }
      case "OPENAI_API_KEY": {
        if (!env.openaiKey) throw new Error("No key set");
        await new OpenAI({ apiKey: env.openaiKey, maxRetries: 0 }).models.retrieve(env.imageModel);
        return Response.json({ ok: true, message: `Connected. ${env.imageModel} is available.` });
      }
      case "CLAUDE_CLI": {
        const t = Date.now();
        const reply = await cliPing(modelFor("ideas"));
        return Response.json({ ok: true, message: `Claude Code answered "${reply.slice(0, 20)}" in ${((Date.now() - t) / 1000).toFixed(1)}s, using your Claude plan.` });
      }
      case "CODEX_TEXT": {
        const t = Date.now();
        const reply = await codexPing();
        return Response.json({ ok: true, message: `Codex answered "${reply.slice(0, 20)}" in ${((Date.now() - t) / 1000).toFixed(1)}s, using your ChatGPT plan.` });
      }
      case "CODEX_IMAGE": {
        const t = Date.now();
        const png = await new CodexImageProvider().generate({
          prompt: "A single orange circle with a thick black outline on a plain white background.",
          quality: "low",
          projectId: null,
        });
        return Response.json({
          ok: true,
          message: `Codex drew a test image (${Math.round(png.length / 1024)} KB) in ${Math.round((Date.now() - t) / 1000)}s, using your ChatGPT plan.`,
        });
      }
      default:
        throw new Error("Unknown provider");
    }
  } catch (e) {
    const status = (e as { status?: number }).status;
    const message =
      status === 401 ? "Key was rejected (401). Check that it was copied completely."
      : status === 403 ? "Key works but lacks access (403). Check billing or permissions on the account."
      : status === 404 ? "Key works, but the selected model isn't available to this account (404)."
      : e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, message });
  }
});
