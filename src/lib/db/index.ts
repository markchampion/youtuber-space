import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { nanoid } from "nanoid";
import * as schema from "./schema";
import { DATA_DIR } from "@/lib/paths";
import { ANCIENT_HUMANS_PROFILE } from "@/lib/channel-seed";
import { DEFAULT_VOICE_SETTINGS } from "@/lib/channel";
import { normalizeProfile } from "@/lib/channel-normalize";

type DB = BetterSQLite3Database<typeof schema>;
const g = globalThis as unknown as { __db?: DB };

function init(): DB {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new Database(path.join(DATA_DIR, "app.db"));
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  // Jobs left "running" by a server process that no longer exists can never finish.
  // Next may serve routes from several live processes, so check the owner is really gone.
  const running = sqlite.prepare("SELECT id, owner FROM jobs WHERE status = 'running'").all() as { id: string; owner: number | null }[];
  const orphan = sqlite.prepare("UPDATE jobs SET status = 'error', error = 'Server restarted while this job was running' WHERE id = ?");
  for (const j of running) if (!j.owner || !processAlive(j.owner)) orphan.run(j.id);

  // Prompts read profiles straight from the database, so bring older ones to the current shape once.
  for (const c of db.select({ id: schema.channels.id, profile: schema.channels.profile }).from(schema.channels).all()) {
    if ((c.profile.profileVersion ?? 1) < 2) {
      db.update(schema.channels).set({ profile: normalizeProfile(c.profile) }).where(eq(schema.channels.id, c.id)).run();
    }
  }

  if (!db.select().from(schema.channels).limit(1).all().length) {
    db.insert(schema.channels)
      .values({
        id: nanoid(10),
        name: ANCIENT_HUMANS_PROFILE.name,
        profile: ANCIENT_HUMANS_PROFILE,
        voiceSettings: DEFAULT_VOICE_SETTINGS,
        pronunciations: { Wiessner: "Veesner", Blombos: "Blom-boss" },
      })
      .run();
  }
  return db;
}

function processAlive(pid: number) {
  try {
    process.kill(pid, 0); // signal 0 only checks existence
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

export const db: DB = g.__db ?? (g.__db = init());
export { schema };
