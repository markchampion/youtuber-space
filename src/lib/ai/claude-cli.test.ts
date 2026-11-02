import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CLAUDE_STRIP_ENV, buildClaudeArgs, explainClaudeError, parseClaudeResult, parseJsonLoose, streamTextDelta } from "./claude-cli-parse";
import { runCli } from "../cli-tools";

describe("claude -p arguments", () => {
  it("disables tools/MCP/sessions, sets system prompt, model, effort and schema", () => {
    const a = buildClaudeArgs({ system: "SYS", model: "claude-sonnet-5", effort: "medium", jsonSchema: { type: "object" } });
    expect(a).toContain("-p");
    expect(a[a.indexOf("--tools") + 1]).toBe("");
    expect(a).toContain("--strict-mcp-config");
    expect(a).toContain("--no-session-persistence");
    expect(a[a.indexOf("--system-prompt") + 1]).toBe("SYS");
    expect(a[a.indexOf("--model") + 1]).toBe("claude-sonnet-5");
    expect(a[a.indexOf("--effort") + 1]).toBe("medium");
    expect(JSON.parse(a[a.indexOf("--json-schema") + 1])).toEqual({ type: "object" });
    expect(a[a.indexOf("--output-format") + 1]).toBe("json");
  });
  it("streams with partial messages when asked", () => {
    const a = buildClaudeArgs({ system: "S", model: "m", stream: true });
    expect(a[a.indexOf("--output-format") + 1]).toBe("stream-json");
    expect(a).toContain("--include-partial-messages");
    expect(a).not.toContain("--json-schema");
  });
});

describe("output parsing", () => {
  it("reads the result object, preferring structured output", () => {
    const out = ['{"type":"system"}', '{"type":"result","is_error":false,"result":"{\\"a\\":1}","structured_output":{"a":2}}'].join("\n");
    expect(parseClaudeResult(out)).toMatchObject({ structured: { a: 2 }, isError: false });
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("extracts streamed text deltas", () => {
    const line = JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } } });
    expect(streamTextDelta(line)).toBe("Hi");
    expect(streamTextDelta('{"type":"assistant"}')).toBeNull();
    expect(streamTextDelta("not json")).toBeNull();
  });
  it("explains login and limit errors", () => {
    const notLogged = parseClaudeResult('{"type":"result","is_error":true,"result":"Not logged in · Please run /login"}');
    expect(explainClaudeError(notLogged, "", false)).toMatch(/not logged in/i);
    expect(explainClaudeError({ text: "", structured: null, isError: true, status: 429 }, "", false)).toMatch(/limit/i);
    expect(() => parseClaudeResult("garbage")).toThrow(/no result/);
  });
});

describe("runCli", () => {
  it("strips API keys from the child env and pipes stdin", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-should-not-leak";
    const r = await runCli(
      process.execPath,
      ["-e", "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify({key:process.env.ANTHROPIC_API_KEY??null,s})))"],
      { stdin: "hello", cwd: path.join(os.tmpdir(), "cli-test"), timeoutMs: 10_000, stripEnv: CLAUDE_STRIP_ENV },
    );
    expect(JSON.parse(r.stdout)).toEqual({ key: null, s: "hello" });
    delete process.env.ANTHROPIC_API_KEY;
  });
});
