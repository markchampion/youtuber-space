import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ALL_SETTINGS, type PublicSetting, type SettingKey, type SettingSource } from "./settings-defs";

const DEFS = new Map(ALL_SETTINGS.map((d) => [d.key, d]));

function saved(key: SettingKey): string | undefined {
  return db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()?.value;
}

/** Saved in the app > .env.local > built-in default. */
export function getSetting(key: SettingKey): string {
  return saved(key) ?? (process.env[key] || undefined) ?? defaultFor(key);
}

function defaultFor(key: SettingKey): string {
  // Someone who pinned a single model in .env.local keeps "all Opus" until they pick a preset.
  if (key === "CLAUDE_PRESET" && process.env.CLAUDE_MODEL) return "quality";
  return DEFS.get(key)?.default ?? "";
}

export function settingSource(key: SettingKey): SettingSource {
  if (saved(key) !== undefined) return "saved";
  if (process.env[key]) return "env";
  return "default";
}

export function mask(secret: string) {
  if (!secret) return "";
  return secret.length <= 12 ? "••••" : `${secret.slice(0, 7)}…${secret.slice(-4)}`;
}

/** Safe to send to the browser: secrets are masked. */
export function publicSettings(): PublicSetting[] {
  return ALL_SETTINGS.map((d) => {
    const value = getSetting(d.key);
    return { key: d.key, value: d.secret ? mask(value) : value, source: settingSource(d.key), isSet: Boolean(value) };
  });
}

/** Empty string or null removes the saved value (falls back to .env.local / default). */
export function saveSettings(values: Partial<Record<SettingKey, string | null>>) {
  for (const [key, raw] of Object.entries(values) as [SettingKey, string | null][]) {
    if (!DEFS.has(key)) throw new Error(`Unknown setting ${key}`);
    const value = raw?.trim() ?? "";
    if (!value) {
      db.delete(schema.settings).where(eq(schema.settings.key, key)).run();
    } else {
      db.insert(schema.settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
        .run();
    }
  }
}
