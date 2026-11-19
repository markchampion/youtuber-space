import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import { isDrama } from "@/lib/channel";
import { chapterOfKey } from "@/lib/outline-templates";
import { splitChapters } from "@/lib/chapters";
import { slugify } from "@/lib/sync";
import type { Outline } from "@/lib/types";
import { getChannel, getProject } from "./common";
import { saveScript } from "./script";

export type ChapterVideo = {
  id: string;
  chapter: number;
  title: string;
  scriptApproved: boolean;
  /** The story's chapter text no longer matches this video's script (the story or the video was edited). */
  differs: boolean;
  updatedAt: string;
};

/** A drama project with no parent holds a whole story; its chapters become their own videos. */
export function isStoryProject(p: { parentId: string | null }, profile: Parameters<typeof isDrama>[0]) {
  return isDrama(profile) && !p.parentId;
}

/** Videos made from a story's chapters, by chapter number. */
export function chapterVideos(storyId: string): ChapterVideo[] {
  const story = getProject(storyId);
  const chapters = splitChapters(story.script);
  return db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.parentId, storyId))
    .orderBy(asc(schema.projects.chapter))
    .all()
    .map((c) => ({
      id: c.id,
      chapter: c.chapter ?? 0,
      title: c.title,
      scriptApproved: Boolean(c.approvals.script),
      differs: (chapters.find((x) => x.n === c.chapter)?.text.trim() ?? "") !== (c.script ?? "").trim(),
      updatedAt: c.updatedAt,
    }));
}

/** The part of a story outline that belongs to one chapter, plus the story bible. */
function chapterOutline(outline: Outline | null, n: number): Outline | null {
  if (!outline) return null;
  return {
    sections: outline.sections.filter((s) => chapterOfKey(s.key) === n),
    evidence: outline.evidence,
    chapters: outline.chapters?.filter((c) => c.n === n),
  };
}

export type ChapterVideosResult = { created: string[]; updated: string[]; skipped: { chapter: number; reason: "approved" | "missing" }[] };

/**
 * Make one video per chosen chapter. A new video gets the chapter's text as its (unapproved) script. A chapter that already
 * has a video is updated only while its script isn't approved, or when `force` is set (then later steps are marked stale).
 */
export function createChapterVideos(storyId: string, numbers: number[], force = false): ChapterVideosResult {
  const story = getProject(storyId);
  const channel = getChannel(story.channelId);
  if (!isStoryProject(story, channel.profile)) throw new Error("Only drama story projects have chapter videos");
  const chapters = splitChapters(story.script);
  const existing = new Map(chapterVideos(storyId).map((v) => [v.chapter, v]));
  const result: ChapterVideosResult = { created: [], updated: [], skipped: [] };

  for (const n of [...new Set(numbers)].sort((a, b) => a - b)) {
    const ch = chapters.find((c) => c.n === n);
    if (!ch?.text.trim()) {
      result.skipped.push({ chapter: n, reason: "missing" });
      continue;
    }
    const video = existing.get(n);
    if (video) {
      if (video.scriptApproved && !force) {
        result.skipped.push({ chapter: n, reason: "approved" });
        continue;
      }
      saveScript(video.id, ch.text, "edit", `from story chapter ${n}`);
      result.updated.push(video.id);
      continue;
    }
    const title = `${story.title} – Phần ${n}${ch.title ? `: ${ch.title}` : ""}`;
    const id = nanoid(10);
    db.insert(schema.projects)
      .values({
        id,
        channelId: story.channelId,
        ideaId: story.ideaId,
        title,
        slug: slugify(title),
        angle: story.angle,
        hook: story.hook,
        outline: chapterOutline(story.outline, n),
        parentId: storyId,
        chapter: n,
      })
      .run();
    saveScript(id, ch.text, "initial", `from story chapter ${n}`);
    result.created.push(id);
  }
  return result;
}

/** Remove the link from chapter videos to a story that is being deleted (the videos themselves are kept). */
export function detachChapterVideos(storyId: string) {
  db.update(schema.projects).set({ parentId: null }).where(and(eq(schema.projects.parentId, storyId))).run();
}
