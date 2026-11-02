import "server-only";
import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import { absPath, mediaUrl, projectRel } from "@/lib/media";
import { versionAction, type VersionSource } from "@/lib/history-rules";
import { getProject, updateProject } from "./common";

type Kind = "script" | "outline";

// ---------- Script / outline versions ----------

function latestVersion(projectId: string, kind: Kind) {
  return db
    .select()
    .from(schema.textVersions)
    .where(and(eq(schema.textVersions.projectId, projectId), eq(schema.textVersions.kind, kind)))
    .orderBy(desc(schema.textVersions.createdAt))
    .get();
}

/** Save a version of the script or outline (skips duplicates, merges quick successive manual edits). */
export function recordVersion(projectId: string, kind: Kind, content: string, source: VersionSource, note?: string | null) {
  if (!content.trim()) return;
  const latest = latestVersion(projectId, kind);
  const action = versionAction(latest, content, source);
  if (action === "skip") return;
  if (action === "update" && latest) {
    db.update(schema.textVersions).set({ content, createdAt: new Date().toISOString() }).where(eq(schema.textVersions.id, latest.id)).run();
    return;
  }
  db.insert(schema.textVersions).values({ id: nanoid(10), projectId, kind, content, source, note: note ?? null }).run();
}

/** Make sure what's on screen now exists as a version (before an AI overwrite, and for older projects). */
export function snapshotCurrent(projectId: string, kind: Kind) {
  const p = getProject(projectId);
  const content = kind === "script" ? p.script : p.outline ? JSON.stringify(p.outline) : null;
  if (!content) return;
  const latest = latestVersion(projectId, kind);
  if (latest?.content === content) return;
  db.insert(schema.textVersions)
    .values({ id: nanoid(10), projectId, kind, content, source: latest ? "edit" : "initial" })
    .run();
}

export function listVersions(projectId: string, kind: Kind) {
  snapshotCurrent(projectId, kind);
  return db
    .select()
    .from(schema.textVersions)
    .where(and(eq(schema.textVersions.projectId, projectId), eq(schema.textVersions.kind, kind)))
    .orderBy(desc(schema.textVersions.createdAt))
    .all();
}

export function getVersion(versionId: string) {
  const v = db.select().from(schema.textVersions).where(eq(schema.textVersions.id, versionId)).get();
  if (!v) throw new Error("Version not found");
  return v;
}

// ---------- Renders ----------

function fileSize(rel: string | null) {
  try {
    return rel ? fs.statSync(absPath(rel)).size : null;
  } catch {
    return null;
  }
}

export function recordRender(r: {
  projectId: string;
  shortId?: string | null;
  path: string;
  srtPath?: string | null;
  durationSec: number;
  options: Record<string, string | number | boolean>;
}) {
  db.insert(schema.renders)
    .values({ id: nanoid(10), projectId: r.projectId, shortId: r.shortId ?? null, path: r.path, srtPath: r.srtPath ?? null, durationSec: r.durationSec, sizeBytes: fileSize(r.path), options: r.options })
    .run();
}

function rendersFor(projectId: string, shortId: string | null) {
  return db
    .select()
    .from(schema.renders)
    .where(and(eq(schema.renders.projectId, projectId), shortId ? eq(schema.renders.shortId, shortId) : isNull(schema.renders.shortId)))
    .orderBy(desc(schema.renders.createdAt))
    .all();
}

/** Renders newest first; a current render made before history existed is added once. */
export function listRenders(projectId: string, shortId: string | null = null) {
  let rows = rendersFor(projectId, shortId);
  const current = shortId
    ? db.select().from(schema.shorts).where(eq(schema.shorts.id, shortId)).get()?.renderPath
    : getProject(projectId).renderPath;
  if (current && !rows.some((r) => r.path === current) && fs.existsSync(absPath(current))) {
    const srt = current.replace(/\.mp4$/, ".srt");
    recordRender({ projectId, shortId, path: current, srtPath: fs.existsSync(absPath(srt)) ? srt : null, durationSec: 0, options: {} });
    rows = rendersFor(projectId, shortId);
  }
  return rows.map((r) => ({ ...r, url: mediaUrl(r.path), srtUrl: mediaUrl(r.srtPath), current: r.path === current }));
}

/** Delete one render; if it was current, the next newest becomes current. */
export function deleteRender(renderId: string) {
  const r = db.select().from(schema.renders).where(eq(schema.renders.id, renderId)).get();
  if (!r) throw new Error("Render not found");
  for (const f of [r.path, r.srtPath]) if (f) fs.rmSync(absPath(f), { force: true });
  db.delete(schema.renders).where(eq(schema.renders.id, renderId)).run();
  const next = rendersFor(r.projectId, r.shortId)[0]?.path ?? null;
  if (r.shortId) {
    const s = db.select().from(schema.shorts).where(eq(schema.shorts.id, r.shortId)).get();
    if (s?.renderPath === r.path) db.update(schema.shorts).set({ renderPath: next }).where(eq(schema.shorts.id, r.shortId)).run();
  } else if (getProject(r.projectId).renderPath === r.path) {
    updateProject(r.projectId, { renderPath: next });
  }
}

/** Remove all renders (files + rows) of a project, or of one Short. */
export function deleteAllRenders(projectId: string, shortId?: string) {
  const rows = db
    .select()
    .from(schema.renders)
    .where(shortId ? eq(schema.renders.shortId, shortId) : eq(schema.renders.projectId, projectId))
    .all();
  for (const r of rows) for (const f of [r.path, r.srtPath]) if (f) fs.rmSync(absPath(f), { force: true });
  db.delete(schema.renders).where(shortId ? eq(schema.renders.shortId, shortId) : eq(schema.renders.projectId, projectId)).run();
}

/**
 * Generated video files of a project: everything in renders/ (MP4s, SRTs, render props) plus the
 * Short MP4s and props at the top of shorts/. Voice audio, scene images and the vertical images in
 * shorts/images/ are not included.
 */
function generatedVideoFiles(projectId: string) {
  const files: string[] = [];
  for (const dir of ["renders", "shorts"]) {
    const abs = absPath(projectRel(projectId, dir));
    if (!fs.existsSync(abs)) continue;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) if (e.isFile()) files.push(path.join(abs, e.name));
  }
  return files;
}

/** Disk space the "Delete generated videos" cleanup would free. */
export function generatedVideoBytes(projectId: string) {
  return generatedVideoFiles(projectId).reduce((n, f) => n + (fs.statSync(f, { throwIfNoEntry: false })?.size ?? 0), 0);
}

/**
 * Cleanup for a finished project: delete every render of the video and its Shorts (current and
 * history) to free disk space. Voice, images and thumbnails stay, so the project can be re-rendered.
 */
export function deleteGeneratedVideos(projectId: string) {
  const files = generatedVideoFiles(projectId);
  let freed = 0;
  for (const f of files) {
    freed += fs.statSync(f, { throwIfNoEntry: false })?.size ?? 0;
    fs.rmSync(f, { force: true });
  }
  db.delete(schema.renders).where(eq(schema.renders.projectId, projectId)).run();
  db.update(schema.shorts).set({ renderPath: null }).where(eq(schema.shorts.projectId, projectId)).run();
  updateProject(projectId, { renderPath: null });
  return { freedBytes: freed, files: files.length };
}
