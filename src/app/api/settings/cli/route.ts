import path from "node:path";
import { handler } from "@/lib/api";
import { DATA_DIR } from "@/lib/paths";
import { claudeStatus, codexStatus } from "@/lib/cli-tools";
import { claudeBin } from "@/lib/ai/claude-cli";
import { codexBin } from "@/lib/image/codex";

export const dynamic = "force-dynamic";

/** Is each subscription CLI installed and logged in? Free: runs only --version and login status. */
export const GET = handler(async () => {
  const cwd = path.join(DATA_DIR, "claude-cli");
  const [claude, codex] = await Promise.all([claudeStatus(claudeBin(), cwd), codexStatus(codexBin(), cwd)]);
  return Response.json({ claude, codex });
});
