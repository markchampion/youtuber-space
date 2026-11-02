import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { findBinary, windowsShimCommand } from "./cli-tools";

const env = { PATH: process.env.PATH, PATHEXT: process.env.PATHEXT };
afterEach(() => {
  process.env.PATH = env.PATH;
  process.env.PATHEXT = env.PATHEXT;
});

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cli-tools-"));
}

describe("findBinary", () => {
  it("finds a PATHEXT variant on Windows, preferring .exe over .cmd", () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "codex.cmd"), "");
    fs.writeFileSync(path.join(dir, "codex.exe"), "");
    process.env.PATH = dir;
    process.env.PATHEXT = ".COM;.EXE;.BAT;.CMD";
    expect(findBinary("codex", undefined, [], "win32")).toBe(path.join(dir, "codex.exe"));
    fs.rmSync(path.join(dir, "codex.exe"));
    expect(findBinary("codex", undefined, [], "win32")).toBe(path.join(dir, "codex.cmd"));
  });

  it("only takes the bare name on POSIX, and it must be executable", () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "claude.exe"), "");
    fs.writeFileSync(path.join(dir, "claude"), "");
    process.env.PATH = dir;
    expect(findBinary("claude", undefined, [], "darwin")).toBeNull();
    fs.chmodSync(path.join(dir, "claude"), 0o755);
    expect(findBinary("claude", undefined, [], "darwin")).toBe(path.join(dir, "claude"));
  });

  it("expands %VAR% in fallbacks", () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "codex.cmd"), "");
    process.env.PATH = "";
    process.env.CLI_TOOLS_TEST_DIR = dir;
    expect(findBinary("codex", undefined, ["%CLI_TOOLS_TEST_DIR%/codex.cmd"], "win32")).toBe(`${dir}/codex.cmd`);
    delete process.env.CLI_TOOLS_TEST_DIR;
  });
});

describe("windowsShimCommand", () => {
  it("is not used for .exe files or off Windows", () => {
    expect(windowsShimCommand("C:\\bin\\claude.exe", ["-p"], "win32")).toBeNull();
    expect(windowsShimCommand("/usr/bin/codex.cmd", ["-p"], "darwin")).toBeNull();
  });

  it("quotes paths with spaces and empty args", () => {
    expect(windowsShimCommand("C:\\Users\\A B\\npm\\codex.cmd", ["exec", "-i", "C:\\Users\\A B\\x.png", "--tools", ""], "win32"))
      .toBe('"C:\\Users\\A B\\npm\\codex.cmd" exec -i "C:\\Users\\A B\\x.png" --tools ""');
  });

  it("refuses args cmd.exe can't pass safely", () => {
    expect(() => windowsShimCommand("codex.cmd", ['{"a":1}'], "win32")).toThrow(/\.exe/);
    expect(() => windowsShimCommand("codex.cmd", ["line1\nline2"], "win32")).toThrow();
  });
});
