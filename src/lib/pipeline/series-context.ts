import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { seriesContext } from "@/lib/ai/prompts";

/**
 * Text appended to a series episode's outline / script / metadata prompt; "" for standalone videos.
 * Reads the plan fresh each time, so plan edits apply to the next generation.
 */
export function seriesBlock(project: { seriesId: string | null; episode: number | null }, kind: "story" | "metadata"): string {
  if (!project.seriesId || !project.episode) return "";
  const s = db.select().from(schema.series).where(eq(schema.series.id, project.seriesId)).get();
  if (!s) return "";
  if (kind === "story") return `\n\n${seriesContext(s, project.episode)}`;
  return `\n\nThis video is episode ${project.episode} of ${s.episodes.length} in the series "${s.title}". Make the title alternatives work as part of a series (you may end them with "(Part ${project.episode})" when it helps), and say near the top of the description which part it is and that the other parts are on the channel.`;
}
