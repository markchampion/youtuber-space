// Pure helpers for driving `claude -p` (Claude Code headless mode). Unit-tested in claude-cli.test.ts.

export type CliCallOpts = {
  system: string;
  model: string;
  effort?: string;
  jsonSchema?: object; // structured output
  stream?: boolean; // stream-json with partial messages (for live text)
};

/** Environment variables removed from the child so it uses the subscription login, never an API key. */
export const CLAUDE_STRIP_ENV = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"];

export function buildClaudeArgs(o: CliCallOpts): string[] {
  const args = [
    "-p",
    "--output-format",
    o.stream ? "stream-json" : "json",
    "--system-prompt",
    o.system,
    "--model",
    o.model,
    // Text only: no tools, no MCP servers, no saved session.
    "--tools",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
  ];
  if (o.stream) args.push("--verbose", "--include-partial-messages");
  if (o.effort) args.push("--effort", o.effort);
  if (o.jsonSchema) args.push("--json-schema", JSON.stringify(o.jsonSchema));
  return args;
}

export type CliResult = { text: string; structured: unknown; isError: boolean; status: number | null };

/** Find the final `{"type":"result"}` object in json or stream-json output. */
export function parseClaudeResult(stdout: string): CliResult {
  const lines = stdout.trim().split("\n").reverse();
  for (const line of lines) {
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type !== "result") continue;
    return {
      text: typeof e.result === "string" ? e.result : "",
      structured: e.structured_output ?? null,
      isError: Boolean(e.is_error),
      status: typeof e.api_error_status === "number" ? e.api_error_status : null,
    };
  }
  throw new Error("Claude Code returned no result. Is the CLI up to date?");
}

/** Text delta from one stream-json line, if it carries one. */
export function streamTextDelta(line: string): string | null {
  try {
    const e = JSON.parse(line);
    const ev = e.type === "stream_event" ? e.event : null;
    if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta") return ev.delta.text as string;
  } catch {
    // Not JSON (e.g. a warning line).
  }
  return null;
}

/** Parse JSON from model text, tolerating a ```json fence around it. */
export function parseJsonLoose(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(t);
}

/** Turn CLI failures into messages that tell the user what to do. */
export function explainClaudeError(r: CliResult | null, stderr: string, timedOut: boolean): string {
  if (timedOut) return "Claude Code took too long and was stopped. Try again, or pick a faster model in Settings.";
  const msg = `${r?.text ?? ""} ${stderr}`.trim();
  if (/not logged in|\/login|authentication/i.test(msg)) return "Claude Code is not logged in. Run `claude` in a terminal, use /login, then try again.";
  if (r?.status === 429 || /usage limit|rate limit|limit reached|quota/i.test(msg)) {
    return "Claude plan usage limit reached. Try again later, or switch Claude to API key in Settings.";
  }
  return `Claude Code failed: ${msg.slice(0, 400) || "unknown error"}`;
}
