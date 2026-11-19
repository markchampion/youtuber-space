"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import type { Project, Series } from "@/lib/db/schema";
import type { SeriesEpisode, SeriesPlan } from "@/lib/types";
import { STEPS } from "@/lib/types";
import { Badge, Button, Card, ErrorNote, Input, Label, Spinner, Textarea, useSyncedState } from "@/components/ui";
import { autoStepLabel, stepLabel, useT } from "@/lib/i18n";
import { AUTO_STEP_LABELS } from "@/lib/channel";

type EpisodeProject = Pick<Project, "id" | "title" | "episode" | "approvals" | "autopilot" | "renderPath">;
type SeriesData = Series & { projects: EpisodeProject[] };

const MAX_EPISODES = 10;
const blank: SeriesEpisode = { title: "", hook: "", covers: [], teaser: "" };

export default function SeriesPage() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, error } = useQuery({
    queryKey: ["series", id],
    queryFn: () => api<{ series: SeriesData }>(`/api/series/${id}`),
    refetchInterval: (q) => (q.state.data?.series.projects.some((p) => p.autopilot?.status === "running") ? 4000 : false),
  });
  const s = data?.series;
  const [plan, setPlan] = useSyncedState<SeriesPlan | null>(s ? { title: s.title, premise: s.premise, episodes: s.episodes } : null);
  const [autopilot, setAutopilot] = useState(false);
  const [saved, setSaved] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["series"] });
  };
  const save = useMutation({
    mutationFn: (p: SeriesPlan) => api(`/api/series/${id}`, { json: { action: "update", plan: p } }),
    onSuccess: () => {
      setSaved(true);
      refresh();
    },
  });
  const create = useMutation({
    mutationFn: async (p: SeriesPlan) => {
      await api(`/api/series/${id}`, { json: { action: "update", plan: p } });
      return api<{ projectIds: string[] }>(`/api/series/${id}`, { json: { action: "create", autopilot } });
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/series/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      router.push("/ideas");
    },
  });

  if (error) return <div className="p-8 text-sm text-red-700">{String(error)}</div>;
  if (!s || !plan) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }

  const byEpisode = new Map(s.projects.map((p) => [p.episode, p]));
  const created = s.projects.length;
  const missing = plan.episodes.filter((e, i) => e.title.trim() && !byEpisode.has(i + 1)).length;
  const edit = (next: SeriesPlan) => {
    setSaved(false);
    setPlan(next);
  };
  const editEp = (i: number, patch: Partial<SeriesEpisode>) => edit({ ...plan, episodes: plan.episodes.map((e, j) => (j === i ? { ...e, ...patch } : e)) });

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
      <div className="mb-2 flex items-center gap-2 text-xs text-stone-500">
        <Link href="/ideas" className="hover:text-stone-800">
          {t("nav.links.ideas")}
        </Link>
        <span>/</span>
        <Layers className="size-3.5" /> {t("series.yourSeries")}
      </div>
      <Card className="mb-6 space-y-4 p-5">
        <div>
          <Label>{t("series.title")}</Label>
          <Input value={plan.title} onChange={(e) => edit({ ...plan, title: e.target.value })} className="text-lg font-semibold" />
        </div>
        <div>
          <Label>{t("series.premise")}</Label>
          <Textarea rows={2} value={plan.premise} onChange={(e) => edit({ ...plan, premise: e.target.value })} />
        </div>
        <p className="text-xs leading-relaxed text-stone-500">{t("series.intro")}</p>
      </Card>

      <ol className="space-y-4">
        {plan.episodes.map((e, i) => {
          const p = byEpisode.get(i + 1);
          return (
            <li key={i}>
              <Card className="p-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{t("series.episode", { n: i + 1 })}</Badge>
                  {p ? <EpisodeStatus project={p} /> : <Badge tone="neutral">{t("series.notCreated")}</Badge>}
                  <div className="ml-auto flex gap-2">
                    {p ? (
                      <Link href={`/projects/${p.id}/script`}>
                        <Button size="sm" variant="secondary">
                          {t("series.open")}
                        </Button>
                      </Link>
                    ) : i >= created && plan.episodes.length > 2 ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t("series.removeEpisode")}
                        className="text-stone-400 hover:text-red-600"
                        icon={<Trash2 className="size-3.5" />}
                        onClick={() => edit({ ...plan, episodes: plan.episodes.filter((_, j) => j !== i) })}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Label>{t("series.epTitle")}</Label>
                    <Input value={e.title} onChange={(ev) => editEp(i, { title: ev.target.value })} />
                  </div>
                  <div>
                    <Label>{t("series.epHook")}</Label>
                    <Textarea rows={3} value={e.hook} onChange={(ev) => editEp(i, { hook: ev.target.value })} />
                  </div>
                  <div>
                    <Label>{t("series.epCovers")}</Label>
                    <Textarea rows={3} value={e.covers.join("\n")} onChange={(ev) => editEp(i, { covers: ev.target.value.split("\n") })} />
                  </div>
                  {i < plan.episodes.length - 1 ? (
                    <div className="md:col-span-2">
                      <Label>{t("series.epTeaser")}</Label>
                      <Input value={e.teaser} onChange={(ev) => editEp(i, { teaser: ev.target.value })} />
                    </div>
                  ) : null}
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-3 border-t border-stone-200 bg-stone-50/95 py-4 backdrop-blur">
        {plan.episodes.length < MAX_EPISODES ? (
          <Button variant="ghost" icon={<Plus className="size-4" />} onClick={() => edit({ ...plan, episodes: [...plan.episodes, { ...blank }] })}>
            {t("series.addEpisode")}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className="text-stone-500 hover:text-red-600"
          icon={<Trash2 className="size-4" />}
          loading={remove.isPending}
          onClick={() => confirm(t("series.deleteConfirm")) && remove.mutate()}
        >
          {t("series.delete")}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate(cleanPlan(plan))}>
            {saved ? t("series.saved") : t("series.save")}
          </Button>
          {missing ? (
            <>
              <label className="flex items-center gap-2 text-sm text-stone-600">
                <input type="checkbox" checked={autopilot} onChange={(e) => setAutopilot(e.target.checked)} />
                {t("series.autopilot")}
              </label>
              <Button variant="primary" loading={create.isPending} onClick={() => create.mutate(cleanPlan(plan))}>
                {created ? t("series.createMore") : t("series.create")}
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <ErrorNote error={save.error ?? create.error ?? remove.error} />
    </main>
  );
}

/** Drop empty "covers" lines before saving. */
function cleanPlan(p: SeriesPlan): SeriesPlan {
  return { ...p, episodes: p.episodes.map((e) => ({ ...e, covers: e.covers.map((c) => c.trim()).filter(Boolean) })) };
}

/** Furthest approved step, or Autopilot's state, or rendered. */
function EpisodeStatus({ project }: { project: EpisodeProject }) {
  const t = useT();
  const a = project.autopilot;
  if (a?.status === "running") {
    return (
      <Badge tone="blue">
        <Spinner className="mr-1 inline size-3" />
        {autoStepLabel(t, a.step, AUTO_STEP_LABELS[a.step])}
      </Badge>
    );
  }
  if (project.renderPath) return <Badge tone="green">{t("series.done")}</Badge>;
  const last = [...STEPS].reverse().find((s) => project.approvals[s.key]);
  return last ? <Badge tone="green">✓ {stepLabel(t, last)}</Badge> : null;
}
