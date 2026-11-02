// One-command setup for a fresh clone (Windows, macOS, Linux): `npm run setup`.
// Safe to rerun after `git pull`. Plain Node with no dependencies, so it runs before `npm ci`.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

function step(title) {
  console.log(`\n==> ${title}`);
}

function run(cmd, args) {
  // npm is npm.cmd on Windows, which needs a shell; the args here are fixed and simple.
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: isWin });
  if (r.status !== 0) {
    console.error(`\nFailed: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

step("Checking Node.js");
const major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  console.error(`Node ${process.versions.node} is too old. Install Node 22 LTS:`);
  console.error(isWin ? "  winget install OpenJS.NodeJS.LTS" : "  https://nodejs.org (or: brew install node@22)");
  process.exit(1);
}
console.log(`Node ${process.versions.node} (${process.platform}-${process.arch})`);

step("Installing dependencies (npm ci)");
run("npm", ["ci"]);

step("Preparing .env.local and data/");
const env = path.join(root, ".env.local");
if (!fs.existsSync(env)) {
  fs.copyFileSync(path.join(root, ".env.local.example"), env);
  console.log("Created .env.local from .env.local.example (keys can also be set on the Settings page).");
} else {
  console.log(".env.local already exists, left as is.");
}
fs.mkdirSync(path.join(root, "data"), { recursive: true });

step("Downloading Remotion's headless Chrome (used for MP4 renders)");
run(process.execPath, ["-e", "require('@remotion/renderer').ensureBrowser().then(() => console.log('Browser ready.'))"]);

step("Building the app");
run("npm", ["run", "build"]);

console.log(`
Done. Next:
  npm start                    then open http://localhost:3001
  Settings page                add your Anthropic, ElevenLabs and OpenAI keys, press Test
                               (turn dry run on first to click through for free)
`);
