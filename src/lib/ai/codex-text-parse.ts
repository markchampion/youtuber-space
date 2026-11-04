// Pure helpers for writing text through `codex exec` (Codex headless mode). Unit-tested in codex-text.test.ts.

/** Claude-style effort → Codex `model_reasoning_effort`. */
export function codexEffort(effort?: string): "low" | "medium" | "high" | undefined {
  if (!effort) return undefined;
  if (effort === "low" || effort === "medium") return effort;
  return "high"; // high, xhigh, max
}

/**
 * Text-only run: read-only sandbox, no saved session, and the user's config.toml ignored so their MCP
 * servers, hooks and rules don't load (the ChatGPT login still works). The prompt goes on stdin (`-`).
 */
export function buildCodexTextArgs(o: { model?: string; effort?: string; schemaPath?: string }): string[] {
  const args = ["exec", "--json", "--ephemeral", "--skip-git-repo-check", "--ignore-user-config", "-s", "read-only"];
  if (o.model) args.push("-m", o.model);
  const effort = codexEffort(o.effort);
  if (effort) args.push("-c", `model_reasoning_effort=${effort}`);
  if (o.schemaPath) args.push("--output-schema", o.schemaPath);
  args.push("-");
  return args;
}

/** Codex has no system-prompt flag, so the system prompt leads the stdin prompt. */
export function codexTextPrompt(system: string, user: string, json: boolean): string {
  return [
    "Follow these instructions. You are only writing text: do not run commands, read or write files, or ask questions.",
    json ? "Reply with the JSON object only." : "Reply with the requested text only, with no preamble or closing remarks.",
    "",
    "<instructions>",
    system,
    "</instructions>",
    "",
    user,
  ].join("\n");
}

export type CodexEvents = { text: string; failure: string };

/** The final agent message and any failure from `codex exec --json` output lines. */
export function readCodexEvent(line: string, acc: CodexEvents): void {
  try {
    const e = JSON.parse(line);
    // `item.type === "error"` items are warnings (e.g. an ignored config key); only these end the turn.
    if (e.item?.type === "agent_message" && e.type === "item.completed") acc.text = e.item.text ?? "";
    if (e.type === "turn.failed" || e.type === "error") acc.failure = e.error?.message ?? e.message ?? JSON.stringify(e).slice(0, 300);
  } catch {
    // Non-JSON log line.
  }
}

/** Turn Codex failures into messages that tell the user what to do. */
export function explainCodexError(failure: string, stderr: string, timedOut: boolean): string {
  if (timedOut) return "Codex took too long and was stopped. Try again.";
  const msg = `${failure} ${stderr}`.trim();
  if (/not logged in|please log in|codex login/i.test(msg)) return "Codex is not logged in. Run `codex login` in a terminal, then try again.";
  if (/usage limit|rate limit|limit reached|quota/i.test(msg)) {
    return "ChatGPT plan usage limit reached. Try again later, or switch text to another connection in Settings.";
  }
  return `Codex failed: ${msg.slice(0, 400) || "no reply"}`;
}
