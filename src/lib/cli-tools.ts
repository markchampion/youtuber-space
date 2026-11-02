import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

/** Result of running a CLI to completion. */
export type RunResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

/**
 * Run a CLI with the prompt on stdin. `stripEnv` removes variables (e.g. API keys) so the CLI
 * uses the user's subscription login instead of silently billing an API key.
 */
export function runCli(
  bin: string,
  args: string[],
  opts: { stdin?: string; cwd: string; timeoutMs: number; stripEnv?: string[]; onStdoutLine?: (line: string) => void },
): Promise<RunResult> {
  const env = { ...process.env };
  for (const k of opts.stripEnv ?? []) delete env[k];
  fs.mkdirSync(opts.cwd, { recursive: true });
  let cmd: string | null;
  try {
    cmd = windowsShimCommand(bin, args);
  } catch (e) {
    return Promise.reject(e);
  }
  return new Promise((resolve, reject) => {
    const child = cmd
      ? spawn(cmd, { cwd: opts.cwd, env, stdio: ["pipe", "pipe", "pipe"], shell: true })
      : spawn(bin, args, { cwd: opts.cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let pending = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, opts.timeoutMs);
    child.stdout.on("data", (b: Buffer) => {
      const s = b.toString();
      stdout += s;
      if (opts.onStdoutLine) {
        pending += s;
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const l of lines) if (l.trim()) opts.onStdoutLine(l);
      }
    });
    child.stderr.on("data", (b: Buffer) => (stderr = (stderr + b.toString()).slice(-8000)));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject((e as NodeJS.ErrnoException).code === "ENOENT" ? new Error(`${path.basename(bin)} not found at ${bin}`) : e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (opts.onStdoutLine && pending.trim()) opts.onStdoutLine(pending);
      resolve({ code, stdout, stderr, timedOut });
    });
    if (opts.stdin != null) child.stdin.end(opts.stdin);
    else child.stdin.end();
  });
}

/**
 * Windows can only run `.cmd`/`.bat` shims (e.g. npm-installed CLIs) through cmd.exe, so this builds
 * the quoted command line for `shell: true`. Returns null when no shell is needed. Args that cmd.exe
 * can't pass through safely (quotes, newlines, %, !, ^) are refused: install the `.exe` build instead.
 */
export function windowsShimCommand(bin: string, args: string[], platform = process.platform): string | null {
  if (platform !== "win32" || !/\.(cmd|bat)$/i.test(bin)) return null;
  const quote = (s: string) => {
    if (/["\r\n%!^]/.test(s)) {
      throw new Error(`${path.basename(bin)} is a .cmd shim and can't take this argument safely. Install the .exe version, or point the CLI path setting at it.`);
    }
    return s === "" || /[\s&|<>()]/.test(s) ? `"${s}"` : s;
  };
  return [bin, ...args].map(quote).join(" ");
}

/** Names to try for `name` in a directory: the bare name, plus each PATHEXT extension on Windows. */
function binaryNames(name: string, platform: NodeJS.Platform) {
  if (platform !== "win32") return [name];
  const exts = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  return [...exts.map((e) => name + e.toLowerCase()), name];
}

/** First existing path among an explicit override, $PATH, and known install locations. */
export function findBinary(name: string, override: string | undefined, fallbacks: string[], platform = process.platform): string | null {
  const expand = (f: string) =>
    f.replace(/^~/, os.homedir()).replace(/%([^%]+)%/g, (m, v: string) => process.env[v] ?? m);
  const candidates = [
    override,
    ...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean).flatMap((d) => binaryNames(name, platform).map((n) => path.join(d, n))),
    ...fallbacks.map(expand),
  ].filter(Boolean) as string[];
  return candidates.find((c) => {
    try {
      // Windows has no execute bit; X_OK there only checks that the file exists.
      fs.accessSync(c, platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK);
      return fs.statSync(c).isFile();
    } catch {
      return false;
    }
  }) ?? null;
}

export const CLAUDE_FALLBACKS = [
  "~/.local/bin/claude",
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude",
  "~/.local/bin/claude.exe",
  "%APPDATA%/npm/claude.cmd",
];
export const CODEX_FALLBACKS = [
  "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex",
  "/Applications/ChatGPT.app/Contents/Resources/codex",
  "/opt/homebrew/bin/codex",
  "/usr/local/bin/codex",
  "~/.local/bin/codex",
  "%APPDATA%/npm/codex.cmd",
];

export type CliStatus = { found: boolean; path: string | null; version: string | null; loggedIn: boolean | null; detail: string };

export async function claudeStatus(bin: string | null, cwd: string): Promise<CliStatus> {
  if (!bin) return { found: false, path: null, version: null, loggedIn: null, detail: "Claude Code CLI not found. Install it, or set CLAUDE_CLI_PATH." };
  const v = await runCli(bin, ["--version"], { cwd, timeoutMs: 20_000 }).catch(() => null);
  const s = await runCli(bin, ["auth", "status"], { cwd, timeoutMs: 20_000, stripEnv: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"] }).catch(() => null);
  let loggedIn: boolean | null = null;
  try {
    loggedIn = Boolean(JSON.parse(s?.stdout ?? "").loggedIn);
  } catch {
    // Older CLIs: unknown until the first call.
  }
  return {
    found: true,
    path: bin,
    version: v?.stdout.trim().split("\n")[0] ?? null,
    loggedIn,
    detail: loggedIn === false ? "Not logged in. Run `claude` in a terminal and use /login." : "",
  };
}

export async function codexStatus(bin: string | null, cwd: string): Promise<CliStatus> {
  if (!bin) return { found: false, path: null, version: null, loggedIn: null, detail: "Codex CLI not found. Install it, or set CODEX_CLI_PATH." };
  const v = await runCli(bin, ["--version"], { cwd, timeoutMs: 20_000 }).catch(() => null);
  const s = await runCli(bin, ["login", "status"], { cwd, timeoutMs: 20_000, stripEnv: ["OPENAI_API_KEY"] }).catch(() => null);
  const text = `${s?.stdout ?? ""}${s?.stderr ?? ""}`;
  const loggedIn = /logged in/i.test(text) && !/not logged in/i.test(text);
  return {
    found: true,
    path: bin,
    version: v?.stdout.trim().split("\n")[0] ?? null,
    loggedIn,
    detail: loggedIn ? text.trim().split("\n")[0] : "Not logged in. Run `codex login` in a terminal.",
  };
}
