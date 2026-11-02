import "server-only";
import { and, eq, like, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** Record a call. Subscription CLI calls (provider "*-cli") are logged at $0 so they can be counted. */
export function recordCost(projectId: string | null, provider: string, kind: string, usd: number) {
  if (!usd && !provider.endsWith("-cli")) return;
  db.insert(schema.costs).values({ projectId, provider, kind, usd }).run();
}

export function projectCost(projectId: string): number {
  const row = db
    .select({ total: sql<number>`coalesce(sum(${schema.costs.usd}), 0)` })
    .from(schema.costs)
    .where(eq(schema.costs.projectId, projectId))
    .get();
  return row?.total ?? 0;
}

/** Calls that ran through a subscription CLI (free per call, counted against plan limits). */
export function projectCliCalls(projectId: string): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.costs)
    .where(and(eq(schema.costs.projectId, projectId), like(schema.costs.provider, "%-cli")))
    .get();
  return row?.n ?? 0;
}
