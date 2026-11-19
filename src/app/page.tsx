"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Clapperboard, Lightbulb, Loader2, Plus } from "lucide-react";
import { api } from "@/lib/client";
import { stepsFor, type StepKey } from "@/lib/types";
import { Suspense, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, EmptyState, Spinner, Tabs, cn, fmtTime, fmtUsd } from "@/components/ui";
import { autoStepLabel, stepLabel, useT, type T } from "@/lib/i18n";

type Row = {
  id: string;
  title: string;
  channelName: string;
  kind: "longform" | "product_ad";
  voiceMode: "voice" | "none";
  isStory: boolean;
  parentId: string | null;
  parentTitle: string | null;
  chapter: number | null;
  autopilot: { status: "running" | "paused" | "done" | "error" | "stopped"; step: string; error: string | null } | null;
  job: { type: string; progress: number; message: string | null } | null;
  approvals: Partial<Record<StepKey, string>>;
  stale: Partial<Record<StepKey, boolean>>;
  audioDuration: number | null;
  rendered: boolean;
  updatedAt: string;
  cost: number;
  coverUrl: string | null;
};

/** Chapter videos sit right after their story (in chapter order); everything else keeps the newest-first order. */
function groupChapters(rows: Row[]): Row[] {
  const byParent = new Map<string, Row[]>();
  for (const r of rows) if (r.parentId) byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);
  const present = new Set(rows.map((r) => r.id));
  const out: Row[] = [];
  for (const r of rows) {
    if (r.parentId && present.has(r.parentId)) continue; // placed under its story
    out.push(r);
    for (const c of (byParent.get(r.id) ?? []).sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0))) out.push(c);
  }
  return out;
}

function nextStep(r: Row) {
  const steps = stepsFor(r.kind, r.voiceMode, r.isStory);
  return steps.find((s) => !r.approvals[s.key]) ?? steps[steps.length - 1];
}

type Scope = "channel" | "all";

// "This channel / All channels", remembered per browser.
const scopeListeners = new Set<() => void>();
function readScope(): Scope {
  try {
    return localStorage.getItem("videos-scope") === "all" ? "all" : "channel";
  } catch {
    return "channel";
  }
}
function writeScope(s: Scope) {
  try {
    localStorage.setItem("videos-scope", s);
  } catch {
    // Private mode: just don't remember it.
  }
  scopeListeners.forEach((l) => l());
}
function subscribeScope(l: () => void) {
  scopeListeners.add(l);
  return () => scopeListeners.delete(l);
}

export default function Home() {
  // useSearchParams needs a Suspense boundary.
  return (
    <Suspense fallback={<Spinner />}>
      <VideoList />
    </Suspense>
  );
}

/** One line of live progress for a video an Autopilot / batch is working on. */
function liveStatus(t: T, r: Row): { text: string; tone: "run" | "error" | "paused" } | null {
  const a = r.autopilot;
  if (!a || a.status === "done" || a.status === "stopped") return null;
  if (a.status === "error") return { text: a.error ? t("ideas.home.statusFailedWith", { error: a.error }) : t("ideas.home.statusFailed"), tone: "error" };
  const label = autoStepLabel(t, a.step, a.step.charAt(0).toUpperCase() + a.step.slice(1));
  if (a.status === "paused") return { text: t("ideas.home.statusPaused", { step: t.locale === "en" ? a.step : label }), tone: "paused" };
  return { text: r.job?.message ? `${label}: ${r.job.message}` : `${label}…`, tone: "run" };
}

function VideoList() {
  const t = useT();
  const params = useSearchParams();
  // A batch links here with ?ids=… to show just its videos.
  const only = params.get("ids")?.split(",").filter(Boolean) ?? null;
  const scope = useSyncExternalStore(subscribeScope, readScope, () => "channel" as Scope);
  const setScope = writeScope;
  const { data, isLoading } = useQuery({
    queryKey: ["projects", scope],
    queryFn: () => api<{ channel: { id: string; name: string; kind: Row["kind"] }; projects: Row[] }>(`/api/projects${scope === "all" ? "?channel=all" : ""}`),
    // Keep progress moving while any video is being worked on.
    refetchInterval: (q) => (q.state.data?.projects.some((p) => p.autopilot?.status === "running" || p.job) ? 2000 : false),
  });
  const projects = groupChapters((data?.projects ?? []).filter((p) => !only || only.includes(p.id)));
  const runningCount = projects.filter((p) => p.autopilot?.status === "running").length;
  const failedCount = projects.filter((p) => p.autopilot?.status === "error").length;
  const channelName = data?.channel.name ?? t("ideas.home.thisChannelFallback");
  const ad = data?.channel.kind === "product_ad";
  const newHref = ad ? "/ads/new" : "/ideas";
  const [emptyAdA, emptyAdB] = t("ideas.home.emptyAd", { link: "\u0000" }).split("\u0000");
  const [emptyVideoA, emptyVideoB] = t("ideas.home.emptyVideo", { link: "\u0000" }).split("\u0000");

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("ideas.home.videos")} <span className="text-stone-400">·</span>{" "}
            <span className="text-stone-600">{scope === "all" ? t("ideas.home.allChannels") : channelName}</span>
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            {ad && scope === "channel"
              ? t("ideas.home.adFlow")
              : t("ideas.home.videoFlow")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs<Scope>
            value={scope}
            onChange={setScope}
            items={[
              { value: "channel", label: t("ideas.home.thisChannel") },
              { value: "all", label: t("ideas.home.allChannels") },
            ]}
          />
        <Link href={newHref}>
          <Button variant="primary" icon={<Plus className="size-4" />}>
            {ad ? t("ideas.home.newAd") : t("ideas.home.newVideo")}
          </Button>
        </Link>
        </div>
      </div>

      {only ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm ring-1 ring-stone-200">
          <span className="font-medium">{t("ideas.home.batchOf", { count: only.length })}</span>
          <span className="text-stone-600">
            {[
              runningCount ? t("ideas.home.running", { count: runningCount }) : null,
              t("ideas.home.rendered", { count: projects.filter((p) => p.rendered).length }),
              failedCount ? t("ideas.home.failed", { count: failedCount }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <Link href="/" className="ml-auto text-stone-500 hover:text-stone-800 hover:underline">
            {t("ideas.home.showAll")}
          </Link>
        </div>
      ) : null}

      {isLoading ? (
        <Spinner />
      ) : !projects.length ? (
        <EmptyState icon={<Lightbulb className="size-8" />} title={scope === "all" ? t("ideas.home.noVideos") : t("ideas.home.noVideosFor", { name: channelName })}>
          {ad ? (
            <>
              {emptyAdA}
              <Link href="/ads/new" className="font-medium text-brand-ink underline">
                {t("ideas.home.emptyAdLink")}
              </Link>
              {emptyAdB}
            </>
          ) : (
            <>
              {emptyVideoA}
              <Link href="/ideas" className="font-medium text-brand-ink underline">
                {t("ideas.home.emptyVideoLink")}
              </Link>
              {emptyVideoB}
            </>
          )}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((p) => {
            const step = nextStep(p);
            const steps = stepsFor(p.kind, p.voiceMode, p.isStory);
            const live = liveStatus(t, p);
            const done = steps.filter((s) => p.approvals[s.key]).length;
            return (
              <Link key={p.id} href={`/projects/${p.id}/${step.path}`} className="group">
                <Card className="overflow-hidden transition-shadow group-hover:shadow-md">
                  <div className={cn("relative aspect-video bg-stone-100", p.kind === "product_ad" && "bg-stone-900")}>
                    {p.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.coverUrl} alt="" className={cn("size-full", p.kind === "product_ad" ? "object-contain" : "object-cover")} />
                    ) : (
                      <div className="grid size-full place-items-center text-stone-400">
                        <Clapperboard className="size-8" />
                      </div>
                    )}
                    {p.rendered ? (
                      <span className="absolute right-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">{t("ideas.home.renderedBadge")}</span>
                    ) : null}
                  </div>
                  <div className="p-4">
                    {scope === "all" ? (
                      <div className="mb-1 truncate text-[11px] font-medium uppercase tracking-wide text-stone-500">{p.channelName}</div>
                    ) : null}
                    {p.isStory || p.parentId ? (
                      <div className="mb-1 truncate text-[11px] font-medium uppercase tracking-wide text-brand-ink">
                        {p.isStory ? t("ideas.home.storyBadge") : t("ideas.home.chapterBadge", { n: p.chapter ?? "?", story: p.parentTitle ?? "" })}
                      </div>
                    ) : null}
                    <div className="line-clamp-2 font-medium leading-snug">{p.title}</div>
                    <div className="mt-3 flex gap-1">
                      {steps.map((s) => (
                        <span
                          key={s.key}
                          title={stepLabel(t, s)}
                          className={cn(
                            "h-1.5 flex-1 rounded-full",
                            p.stale[s.key] ? "bg-amber-400" : p.approvals[s.key] ? "bg-emerald-500" : "bg-stone-200",
                          )}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
                      {live ? (
                        <span
                          className={cn(
                            "min-w-0 truncate",
                            live.tone === "error" ? "text-red-700" : live.tone === "paused" ? "text-amber-700" : "text-brand-ink",
                          )}
                          title={live.text}
                        >
                          {live.tone === "run" ? <Loader2 className="mr-1 inline size-3 animate-spin" /> : null}
                          {live.text}
                        </span>
                      ) : (
                        <span>{done === steps.length ? t("ideas.home.done") : t("ideas.home.next", { step: stepLabel(t, step) })}</span>
                      )}
                      <span>
                        {p.audioDuration ? fmtTime(p.audioDuration) + " · " : ""}
                        {fmtUsd(p.cost)}
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
