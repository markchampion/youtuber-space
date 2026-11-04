import "server-only";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { z } from "zod";
import { env } from "@/lib/env";
import { DATA_DIR } from "@/lib/paths";
import { recordCost } from "@/lib/costs";
import { runCli } from "@/lib/cli-tools";
import { codexBin } from "@/lib/image/codex";
import { parseJsonLoose } from "./claude-cli-parse";
import { buildCodexTextArgs, codexTextPrompt, explainCodexError, readCodexEvent, type CodexEvents } from "./codex-text-parse";

type Opts = {
  system: string;
  user: string;
  effort?: string;
  projectId?: string | null;
  kind: string;
  onText?: (delta: string) => void;
  timeoutMs?: number;
};

async function call(o: Opts & { jsonSchema?: object }): Promise<string> {
  const bin = codexBin();
  if (!bin) throw new Error("Codex CLI not found. Install it or set its path in Settings.");
  // A fresh empty folder per call, so no AGENTS.md is picked up and parallel calls don't collide.
  const cwd = path.join(DATA_DIR, "codex-cli", nanoid(8));
  fs.mkdirSync(cwd, { recursive: true });
  let schemaPath: string | undefined;
  if (o.jsonSchema) {
    schemaPath = path.join(cwd, "schema.json");
    fs.writeFileSync(schemaPath, JSON.stringify(o.jsonSchema));
  }
  const acc: CodexEvents = { text: "", failure: "" };
  try {
    const r = await runCli(bin, buildCodexTextArgs({ model: env.codexTextModel || undefined, effort: o.effort, schemaPath }), {
      stdin: codexTextPrompt(o.system, o.user, Boolean(o.jsonSchema)),
      cwd,
      timeoutMs: o.timeoutMs ?? 5 * 60_000,
      stripEnv: ["OPENAI_API_KEY"], // use the ChatGPT login, never bill the API key
      onStdoutLine: (line) => readCodexEvent(line, acc),
    });
    if (!acc.text || acc.failure || r.timedOut) throw new Error(explainCodexError(acc.failure, r.stderr, r.timedOut));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
  recordCost(o.projectId ?? null, "codex-cli", o.kind, 0);
  return acc.text;
}

export async function codexJSON<S extends z.ZodType>(schema: S, o: Opts): Promise<z.infer<S>> {
  const text = await call({ ...o, jsonSchema: z.toJSONSchema(schema, { target: "draft-7" }) });
  let data: unknown;
  try {
    data = parseJsonLoose(text);
  } catch {
    throw new Error("Codex returned text that isn't valid JSON. Try again.");
  }
  return schema.parse(data);
}

/** Codex only reports the finished message, so `onText` gets the whole text at the end. */
export async function codexText(o: Opts): Promise<string> {
  const text = (await call(o)).trim();
  o.onText?.(text);
  return text;
}

/** Tiny round trip for the Settings "Test" button. */
export async function codexPing(): Promise<string> {
  return (await call({ system: "Reply with exactly: OK", user: "Say OK.", effort: "low", kind: "cli_test", timeoutMs: 90_000 })).trim();
}
