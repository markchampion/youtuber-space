import { describe, expect, it } from "vitest";
import { buildCodexTextArgs, codexEffort, codexTextPrompt, explainCodexError, readCodexEvent, type CodexEvents } from "./codex-text-parse";

describe("codex exec arguments", () => {
  it("runs read-only, ephemeral, without user config, prompt on stdin", () => {
    const a = buildCodexTextArgs({});
    expect(a.slice(0, 2)).toEqual(["exec", "--json"]);
    expect(a).toContain("--ephemeral");
    expect(a).toContain("--ignore-user-config");
    expect(a[a.indexOf("-s") + 1]).toBe("read-only");
    expect(a.at(-1)).toBe("-");
    expect(a).not.toContain("-m");
  });

  it("passes model, effort and schema file", () => {
    const a = buildCodexTextArgs({ model: "gpt-5.5", effort: "max", schemaPath: "/tmp/s.json" });
    expect(a[a.indexOf("-m") + 1]).toBe("gpt-5.5");
    expect(a[a.indexOf("-c") + 1]).toBe("model_reasoning_effort=high");
    expect(a[a.indexOf("--output-schema") + 1]).toBe("/tmp/s.json");
  });

  it("keeps args safe for a Windows .cmd shim (no quotes or newlines)", () => {
    for (const arg of buildCodexTextArgs({ model: "gpt-5.5", effort: "low", schemaPath: "C:\\data\\s.json" })) {
      expect(arg).not.toMatch(/["\r\n%!^]/);
    }
  });

  it("maps Claude effort levels", () => {
    expect(codexEffort(undefined)).toBeUndefined();
    expect(codexEffort("low")).toBe("low");
    expect(codexEffort("xhigh")).toBe("high");
  });
});

describe("codex prompt and events", () => {
  it("puts the system prompt ahead of the user prompt", () => {
    const p = codexTextPrompt("SYS", "USER", true);
    expect(p.indexOf("SYS")).toBeLessThan(p.indexOf("USER"));
    expect(p).toMatch(/JSON object only/);
  });

  it("keeps the last agent message and ignores warning items", () => {
    const acc: CodexEvents = { text: "", failure: "" };
    for (const l of [
      '{"type":"thread.started","thread_id":"t"}',
      "2026-11-04T12:49:40Z ERROR rmcp::transport::worker: closed",
      '{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Codex is ignoring 1 unrecognized configuration setting."}}',
      '{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"{\\"answer\\":\\"OK\\"}"}}',
      '{"type":"turn.completed","usage":{"input_tokens":1}}',
    ]) readCodexEvent(l, acc);
    expect(acc).toEqual({ text: '{"answer":"OK"}', failure: "" });
  });

  it("records a failed turn", () => {
    const acc: CodexEvents = { text: "", failure: "" };
    readCodexEvent('{"type":"turn.failed","error":{"message":"You have hit your usage limit"}}', acc);
    expect(explainCodexError(acc.failure, "", false)).toMatch(/usage limit/);
    expect(explainCodexError("", "Not logged in", false)).toMatch(/codex login/);
  });
});
