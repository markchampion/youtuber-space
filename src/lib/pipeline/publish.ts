import "server-only";
import path from "node:path";
import fs from "node:fs";
import { env } from "@/lib/env";
import { claudeJSON } from "@/lib/ai/claude";
import { channelBrief, metadataPrompt } from "@/lib/ai/prompts";
import { showsMainCharacter, thumbnailPrompt } from "@/lib/ai/prompts/thumbnail";
import { MetadataSchema } from "@/lib/types";
import { imageProvider } from "@/lib/image/provider";
import { absPath, projectRel, writeMedia } from "@/lib/media";
import { imageLimit } from "@/lib/jobs/queue";
import { getChannel, getProject, updateProject } from "./common";

export async function generateMetadata(projectId: string) {
  const p = getProject(projectId);
  if (!p.script) throw new Error("No script yet");
  const channel = getChannel(p.channelId);
  const metadata = env.dryRun
    ? {
        titles: [p.title, `${p.title} (Explained)`, `The Truth About ${p.title}`],
        description: `DRY_RUN description for ${p.title}.\n\n#ancienthumans #history`,
        tags: ["ancient humans", "human evolution", "prehistory", "anthropology"],
        thumbnailIdeas: [
          `The mysterious subject of "${p.title}" glowing in the dark, half hidden by fog. Mood: mystery. Text "${p.title.split(" ").slice(0, 3).join(" ").toUpperCase()}?" top left.`,
        ],
      }
    : await claudeJSON(MetadataSchema, {
        system: channelBrief(channel.profile),
        user: metadataPrompt(channel.profile, p.title, p.script),
        effort: "medium",
        kind: "metadata",
        projectId,
      });
  updateProject(projectId, { metadata });
  return metadata;
}

export function thumbnails(projectId: string) {
  const dir = absPath(projectRel(projectId, "thumbnails"));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort().map((f) => projectRel(projectId, "thumbnails", f));
}

export async function generateThumbnail(projectId: string, concept: string) {
  const p = getProject(projectId);
  const channel = getChannel(p.channelId);
  const prompt = thumbnailPrompt(channel.profile, p.title, concept);
  // The character reference only goes along when the concept actually shows the main character.
  const ref = channel.characterRefPath ? absPath(channel.characterRefPath) : null;
  const useRef = showsMainCharacter(concept) && Boolean(ref && fs.existsSync(ref));
  const png = await imageLimit(() => imageProvider().generate({ prompt, quality: "medium", projectId, referencePaths: useRef ? [ref!] : [] }));
  return writeMedia(path.posix.join(projectRel(projectId, "thumbnails"), `thumb_${Date.now()}.png`), png);
}
