import "server-only";
import path from "node:path";
import { z } from "zod";
import { env } from "@/lib/env";
import { DATA_DIR } from "@/lib/paths";
import { recordCost } from "@/lib/costs";
import { CLAUDE_FALLBACKS, findBinary, runCli } from "@/lib/cli-tools";
import {
  CLAUDE_STRIP_ENV,
  buildClaudeArgs,
  explainClaudeError,
  parseClaudeResult,
  parseJsonLoose,
  streamTextDelta,
  type CliResult,
} from "./claude-cli-parse";

// An empty folder, so the CLI picks up no project CLAUDE.md / AGENTS.md.
const CWD = path.join(DATA_DIR, "claude-cli");

export function claudeBin() {
  return findBinary("claude", env.claudeCliPath || undefined, CLAUDE_FALLBACKS);
}

type Opts = {
  system: string;
  user: string;
  model: string;
  effort?: string;
  projectId?: string | null;
  kind: string;
  onText?: (delta: string) => void;
  timeoutMs?: number;
};

async function call(o: Opts & { jsonSchema?: object; stream?: boolean }): Promise<CliResult> {
  const bin = claudeBin();
  if (!bin) throw new Error("Claude Code CLI not found. Install it or set its path in Settings.");
  const r = await runCli(bin, buildClaudeArgs(o), {
    stdin: o.user,
    cwd: CWD,
    timeoutMs: o.timeoutMs ?? 5 * 60_000,
    stripEnv: CLAUDE_STRIP_ENV,
    onStdoutLine: o.stream && o.onText ? (line) => {
      const d = streamTextDelta(line);
      if (d) o.onText!(d);
    } : undefined,
  });
  let result: CliResult | null = null;
  try {
    result = parseClaudeResult(r.stdout);
  } catch {
    // Fall through to the error below.
  }
  if (!result || result.isError || r.timedOut) throw new Error(explainClaudeError(result, r.stderr, r.timedOut));
  recordCost(o.projectId ?? null, "claude-cli", o.kind, 0);
  return result;
}

export async function cliJSON<S extends z.ZodType>(schema: S, o: Opts): Promise<z.infer<S>> {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" });
  const r = await call({ ...o, jsonSchema });
  let data: unknown = r.structured;
  if (data == null) {
    try {
      data = parseJsonLoose(r.text);
    } catch {
      throw new Error("Claude Code returned text that isn't valid JSON. Try again.");
    }
  }
  return schema.parse(data);
}

export async function cliText(o: Opts): Promise<string> {
  const r = await call({ ...o, stream: Boolean(o.onText) });
  return r.text.trim();
}

/** Tiny round trip for the Settings "Test" button. */
export async function cliPing(model: string): Promise<string> {
  const r = await call({ system: "Reply with exactly: OK", user: "Say OK.", model, kind: "cli_test", timeoutMs: 90_000 });
  return r.text.trim();
}
