import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { nanoid } from "nanoid";
import { env } from "@/lib/env";
import { DATA_DIR } from "@/lib/paths";
import { recordCost } from "@/lib/costs";
import { CODEX_FALLBACKS, findBinary, runCli } from "@/lib/cli-tools";
import { toFrame, type ImageProvider } from "./provider";

export function codexBin() {
  return findBinary("codex", env.codexCliPath || undefined, CODEX_FALLBACKS);
}

function codexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

/** Wraps our image prompt so the Codex agent makes exactly one image and nothing else. */
const SHAPES = {
  landscape: "widescreen 16:9 image (1536x864)",
  portrait: "vertical 9:16 image (864x1536)",
  square: "square 1:1 image (1024x1024)",
};

export function codexImageInstruction(prompt: string, orientation: keyof typeof SHAPES, quality: string, hasReference: boolean) {
  return [
    `Use the image generation tool to create exactly ONE ${SHAPES[orientation]}.`,
    quality === "low" ? "Keep it a quick, simple drawing." : "Make it clean and polished within the style.",
    hasReference ? "Draw the character(s) exactly like the attached reference image: same face, hair, colors and clothes." : "",
    "Do nothing else: do not write files, run commands or ask questions.",
    "",
    "Image description:",
    prompt,
  ].join("\n");
}

/**
 * Images through the Codex CLI, logged in with the user's ChatGPT plan.
 * `codex exec` saves generated images under $CODEX_HOME/generated_images/<thread_id>/,
 * and the thread id is the first JSON event it prints.
 */
export class CodexImageProvider implements ImageProvider {
  async generate({ prompt, quality, referencePaths = [], projectId, orientation = "landscape" }: Parameters<ImageProvider["generate"]>[0]) {
    const bin = codexBin();
    if (!bin) throw new Error("Codex CLI not found. Install it or set its path in Settings.");
    const refs = referencePaths.filter((p) => fs.existsSync(p));
    const cwd = path.join(DATA_DIR, "codex-cli", nanoid(8));

    let threadId: string | null = null;
    let lastMessage = "";
    let failure = "";
    const r = await runCli(
      bin,
      // `-i` takes a list, so it goes last; the prompt is sent on stdin.
      ["exec", "--json", "--ephemeral", "--skip-git-repo-check", "-s", "read-only", ...refs.flatMap((p) => ["-i", p])],
      {
        stdin: codexImageInstruction(prompt, orientation, quality, refs.length > 0),
        cwd,
        timeoutMs: 10 * 60_000,
        stripEnv: ["OPENAI_API_KEY"], // use the ChatGPT login, never bill the API key
        onStdoutLine: (line) => {
          try {
            const e = JSON.parse(line);
            if (e.type === "thread.started") threadId = e.thread_id;
            if (e.item?.type === "agent_message") lastMessage = e.item.text ?? "";
            if (e.type === "turn.failed" || e.type === "error") failure = e.error?.message ?? e.message ?? JSON.stringify(e).slice(0, 300);
          } catch {
            // Non-JSON log line.
          }
        },
      },
    );
    fs.rmSync(cwd, { recursive: true, force: true });

    const dir = threadId ? path.join(codexHome(), "generated_images", threadId) : null;
    const files =
      dir && fs.existsSync(dir)
        ? fs
            .readdirSync(dir)
            .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
            .map((f) => path.join(dir, f))
            .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs)
        : [];

    if (!files.length) {
      const msg = `${failure} ${lastMessage} ${r.stderr}`;
      if (r.timedOut) throw new Error("Codex took too long to draw this image and was stopped.");
      if (/not logged in|login/i.test(msg) && !/logged in using/i.test(msg)) throw new Error("Codex is not logged in. Run `codex login` in a terminal.");
      if (/usage limit|rate limit|limit reached|quota/i.test(msg)) throw new Error("ChatGPT plan image limit reached. Try again later, or switch images to API key in Settings.");
      throw new Error(`Codex didn't produce an image. ${(failure || lastMessage || r.stderr.slice(-300)).trim()}`);
    }

    // Codex sometimes makes an extra variant; keep the first one.
    const png = await toFrame(fs.readFileSync(files[0]), orientation);
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    recordCost(projectId, "codex-cli", `image_${quality}`, 0);
    return png;
  }
}
