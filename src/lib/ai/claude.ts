import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { env, modelFor } from "@/lib/env";
import { PRICES } from "@/lib/claude-models";
import { cliJSON, cliText } from "./claude-cli";
import { codexJSON, codexText } from "./codex-text";
import { recordCost } from "@/lib/costs";

let client: { key: string; api: Anthropic } | null = null;
function getClient() {
  const key = env.anthropicKey;
  if (!key) throw new Error("Anthropic API key is not set. Add it in Settings (or turn on dry run).");
  if (client?.key !== key) client = { key, api: new Anthropic({ apiKey: key }) };
  return client.api;
}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
type Opts = {
  system: string;
  user: string;
  model?: string;
  effort?: Effort;
  maxTokens?: number;
  projectId?: string | null;
  kind: string;
};

function supportsEffort(model: string) {
  return !model.startsWith("claude-haiku");
}
function supportsFallbacks(model: string) {
  return model.startsWith("claude-opus-5") || model.startsWith("claude-fable");
}

function baseParams(o: Opts) {
  const model = o.model ?? modelFor(o.kind);
  return {
    model,
    max_tokens: o.maxTokens ?? 32000,
    system: o.system,
    messages: [{ role: "user" as const, content: o.user }],
    ...(supportsFallbacks(model)
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
  };
}

function checkStop(msg: Anthropic.Beta.BetaMessage) {
  if (msg.stop_reason === "refusal") {
    throw new Error(`Claude declined this request${msg.stop_details?.explanation ? `: ${msg.stop_details.explanation}` : "."}`);
  }
  if (msg.stop_reason === "max_tokens") throw new Error("Claude hit the max_tokens limit; output was truncated.");
}

function track(msg: Anthropic.Beta.BetaMessage, o: Opts) {
  const [inP, outP] = PRICES[msg.model] ?? [5, 25];
  const u = msg.usage;
  const usd =
    ((u.input_tokens + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1) * inP +
      u.output_tokens * outP) /
    1e6;
  recordCost(o.projectId ?? null, "anthropic", o.kind, usd);
}

function textOf(msg: Anthropic.Beta.BetaMessage) {
  return msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Settings → "Claude Code (my plan)": same call, sent through the local CLI instead of the API. */
function cliOpts(o: Opts) {
  const model = o.model ?? modelFor(o.kind);
  return { ...o, model, effort: supportsEffort(model) ? o.effort : undefined, timeoutMs: o.kind === "script" ? 15 * 60_000 : undefined };
}

/** Settings → "Codex (my ChatGPT plan)": Claude model presets don't apply; Codex uses its own model. */
function codexOpts(o: Opts) {
  return { ...o, timeoutMs: o.kind === "script" ? 15 * 60_000 : undefined };
}

/** Structured output: returns data validated against the zod schema. */
export async function claudeJSON<S extends z.ZodType>(schema: S, o: Opts): Promise<z.infer<S>> {
  if (env.claudeBackend === "cli") return cliJSON(schema, cliOpts(o));
  if (env.claudeBackend === "codex") return codexJSON(schema, codexOpts(o));
  const p = baseParams(o);
  const stream = getClient().beta.messages.stream({
    ...p,
    output_config: {
      format: betaZodOutputFormat(schema),
      ...(supportsEffort(p.model) ? { effort: o.effort ?? "medium" } : {}),
    },
  });
  const msg = await stream.finalMessage();
  checkStop(msg);
  track(msg, o);
  return schema.parse(JSON.parse(textOf(msg)));
}

/** Streamed plain text. `onText` receives deltas as they arrive. */
export async function claudeText(o: Opts & { onText?: (delta: string) => void }): Promise<string> {
  if (env.claudeBackend === "cli") return cliText(cliOpts(o));
  if (env.claudeBackend === "codex") return codexText(codexOpts(o));
  const p = baseParams(o);
  const stream = getClient().beta.messages.stream({
    ...p,
    ...(supportsEffort(p.model) ? { output_config: { effort: o.effort ?? "high" } } : {}),
  });
  if (o.onText) stream.on("text", (d) => o.onText!(d));
  const msg = await stream.finalMessage();
  checkStop(msg);
  track(msg, o);
  return textOf(msg).trim();
}
