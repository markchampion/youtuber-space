# Doodle Studio

A local, single-user app that turns a video idea into a narrated doodle-style YouTube video:

**Ideas → Script → Voice → Scenes → Images → Preview & Render → Shorts → Publish**

The long video is 16:9 (YouTube, Facebook). The **Shorts** step cuts 1–3 vertical 9:16 clips from it (YouTube Shorts, TikTok, Reels).
They reuse the narration and images in a stacked layout (hook title, image, big captions) at almost no cost. Full-screen vertical art for a clip is optional (≈ $0.02 per image at draft quality).

| Step | Provider | What it does |
| --- | --- | --- |
| Ideas | Claude | Generate idea batches, or **evaluate your own idea** (scorecard, risks, sharper versions) |
| Script | Claude | Outline first, then streamed script; paragraph rewrites; fact-check list |
| Voice | ElevenLabs | Per-paragraph TTS with character timestamps (no Descript/Otter step) |
| Scenes | Claude | Groups sentences into scenes; the style prefix and suffix are added in code |
| Images | OpenAI `gpt-image` | Draft/final quality, character reference for consistency, parallel queue |
| Render | Remotion | Same composition for the browser preview and the MP4; SRT export |
| Publish | Claude + gpt-image | Titles, description, tags, thumbnail drafts |

The channel's style rules (niche, voice, hook formula, visual DNA, palette…) live in an editable **Channel profile**,
seeded from the original "ancient humans" prompt.

## Setup

```bash
npm run setup                      # npm ci, .env.local, data/, Remotion's Chrome, production build
npm start                          # http://localhost:3001  (or `npm run dev` while coding)
```

### Install on another machine (Windows)

In PowerShell:

```powershell
winget install OpenJS.NodeJS.LTS Git.Git GitHub.cli   # then open a new terminal
gh auth login
gh repo clone <your-github-user>/youtuber-space
cd youtuber-space
npm run setup
npm start
```

Then open http://localhost:3001, go to **Settings**, turn dry run on, and click one project through to Render to check the install for free.
After that, add your keys and turn dry run off. Double-clicking `start-doodle.cmd` starts the app and opens the browser.

To update later, run `git pull` and then `npm run setup`. Your `data/` folder and `.env.local` are kept.

Optional CLI backends (Settings → text via Claude Code or Codex, images via Codex). No Claude plan? Pick **Codex (my ChatGPT plan)** under Anthropic and all text is written by Codex instead:
- Claude Code: install the native build (`irm https://claude.ai/install.ps1 | iex`), which gives `claude.exe`. The npm `claude.cmd` shim can't take the multi-line system prompt through cmd.exe.
- Codex: `npm i -g @openai/codex`, then `codex login`.
If the app can't find a CLI, set its path on the Settings page.

Add your Anthropic, ElevenLabs and OpenAI keys on the **Settings** page. Each key has a Test button, and changes apply without a restart.
The same page picks which Claude model writes each step (presets: Best quality ≈ $0.88, Balanced ≈ $0.53, Cheapest ≈ $0.25 per video, or Custom per step), the image and voice models, and turns **dry run** on or off (placeholder text, audio and images at no cost).
Settings saved in the app override `.env.local`, which still works (see `.env.local.example`).

Requirements: Node 20+ (22 LTS recommended, see `.nvmrc`; tested on macOS with 23.4 and 26). `npm run setup` downloads Remotion's headless Chrome up front.
Data (SQLite DB and all media) is stored in `./data/`.

> This repo has a project `.npmrc` pointing at the public npm registry, because the global `~/.npmrc` points at a private registry.
> `better-sqlite3` is pinned to v12: v13's prebuilt binary segfaults on Node 23.4.

## How voice ↔ image sync works

1. ElevenLabs `with-timestamps` returns per-character times for the exact text sent. Sentence boundaries are found by
   character offset (pronunciation substitutions are tracked, so offsets stay exact).
2. Paragraphs are requested as raw PCM and stitched with fixed pauses, so every offset is an exact sample count (no MP3 padding drift).
3. Scenes store **sentence ranges, not times**. Times are always derived, so re-voicing a paragraph moves every later image automatically.
4. Frames come from rounded scene *boundaries* (`src/lib/sync.ts#sceneTimeline`), so rounding never accumulates. Cuts land within half a frame (~17 ms).
5. The visual lead (default 150 ms) and per-scene nudges are adjustable in Preview & Render.

## Scripts

- `npm test`: unit tests for timing, stitching, coverage and prompt assembly
- `npm run typecheck`, `npm run lint`
- `npm run db:generate`: create a migration after editing `src/lib/db/schema.ts` (migrations apply on startup)

## Layout

```
src/lib/sync.ts            pure timing logic (tested)
src/lib/pipeline/*.ts      one module per step (ideas, script, voice, scenes, images, render, publish)
src/lib/ai/                Claude client + prompt builders fed by the channel profile
src/lib/tts/, src/lib/image/  ElevenLabs + OpenAI providers (image provider is an interface)
src/remotion/              the video composition (used by the Player and the renderer)
scripts/render.ts          MP4 render, spawned as a child process
src/app/                   UI + API routes (`/api/projects/[id]` is an action endpoint)
```
