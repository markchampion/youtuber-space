"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Clapperboard, Lightbulb, Loader2, Plus } from "lucide-react";
import { api } from "@/lib/client";
import { stepsFor, type StepKey } from "@/lib/types";
import { Suspense, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, EmptyState, Spinner, Tabs, cn, fmtTime, fmtUsd } from "@/components/ui";

type Row = {
  id: string;
  title: string;
  channelName: string;
  kind: "longform" | "product_ad";
  voiceMode: "voice" | "none";
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

function nextStep(r: Row) {
  const steps = stepsFor(r.kind, r.voiceMode);
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
function liveStatus(r: Row): { text: string; tone: "run" | "error" | "paused" } | null {
  const a = r.autopilot;
  if (!a || a.status === "done" || a.status === "stopped") return null;
  if (a.status === "error") return { text: a.error ? `Failed: ${a.error}` : "Failed", tone: "error" };
  if (a.status === "paused") return { text: `Paused at ${a.step}`, tone: "paused" };
  const label = a.step.charAt(0).toUpperCase() + a.step.slice(1);
  return { text: r.job?.message ? `${label}: ${r.job.message}` : `${label}…`, tone: "run" };
}

function VideoList() {
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
  const projects = (data?.projects ?? []).filter((p) => !only || only.includes(p.id));
  const runningCount = projects.filter((p) => p.autopilot?.status === "running").length;
  const channelName = data?.channel.name ?? "this channel";
  const ad = data?.channel.kind === "product_ad";
  const newHref = ad ? "/ads/new" : "/ideas";

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Videos <span className="text-stone-400">·</span> <span className="text-stone-600">{scope === "all" ? "All channels" : channelName}</span>
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            {ad && scope === "channel"
              ? "Each ad goes product photo → script → voice → scenes → images → 9:16 render."
              : "Each video goes idea → script → voice → scenes → images → render."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs<Scope>
            value={scope}
            onChange={setScope}
            items={[
              { value: "channel", label: "This channel" },
              { value: "all", label: "All channels" },
            ]}
          />
        <Link href={newHref}>
          <Button variant="primary" icon={<Plus className="size-4" />}>
            {ad ? "New ad" : "New video"}
          </Button>
        </Link>
        </div>
      </div>

      {only ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm ring-1 ring-stone-200">
          <span className="font-medium">Batch of {only.length}</span>
          <span className="text-stone-600">
            {runningCount ? `${runningCount} running · ` : ""}
            {projects.filter((p) => p.rendered).length} rendered
            {projects.some((p) => p.autopilot?.status === "error") ? ` · ${projects.filter((p) => p.autopilot?.status === "error").length} failed` : ""}
          </span>
          <Link href="/" className="ml-auto text-stone-500 hover:text-stone-800 hover:underline">
            Show all videos
          </Link>
        </div>
      ) : null}

      {isLoading ? (
        <Spinner />
      ) : !projects.length ? (
        <EmptyState icon={<Lightbulb className="size-8" />} title={scope === "all" ? "No videos yet" : `No videos for ${channelName} yet`}>
          {ad ? (
            <>
              <Link href="/ads/new" className="font-medium text-brand-ink underline">Make your first ad</Link>: upload a product photo, add a
              few selling points, and the AI does the rest.
            </>
          ) : (
            <>
              Start from <Link href="/ideas" className="font-medium text-brand-ink underline">Ideas</Link>: generate a batch, or
              paste your own idea and get it scored before you commit.
            </>
          )}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((p) => {
            const step = nextStep(p);
            const steps = stepsFor(p.kind, p.voiceMode);
            const live = liveStatus(p);
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
                      <span className="absolute right-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">Rendered</span>
                    ) : null}
                  </div>
                  <div className="p-4">
                    {scope === "all" ? (
                      <div className="mb-1 truncate text-[11px] font-medium uppercase tracking-wide text-stone-500">{p.channelName}</div>
                    ) : null}
                    <div className="line-clamp-2 font-medium leading-snug">{p.title}</div>
                    <div className="mt-3 flex gap-1">
                      {steps.map((s) => (
                        <span
                          key={s.key}
                          title={s.label}
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
                        <span>{done === steps.length ? "Done" : `Next: ${step.label}`}</span>
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
