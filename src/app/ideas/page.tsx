"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Layers, Lightbulb, Sparkles, Star, Trash2, Wand2 } from "lucide-react";
import { api, useChannel, type Idea } from "@/lib/client";
import type { Series } from "@/lib/db/schema";
import { angleName, isAdChannel, type ChannelProfile } from "@/lib/channel";
import { Scorecard, ScoreRing } from "@/components/scorecard";
import { Badge, Button, Card, EmptyState, ErrorNote, Input, Label, Select, Spinner, Tabs, Textarea, cn } from "@/components/ui";
import { useT, type T } from "@/lib/i18n";

/** Angle name, with the built-in "Fresh angle" translated. */
function angleLabel(t: T, profile: ChannelProfile, id: number | null | undefined) {
  return id === 0 ? t("ideas.freshAngle") : angleName(profile, id);
}

type Mode = "generate" | "evaluate";
type Filter = "all" | "starred" | "mine";

export default function IdeasPage() {
  const [mode, setMode] = useState<Mode>("generate");
  const { data: channelData } = useChannel();
  const profile = channelData?.channel.profile;
  const t = useT();
  const [introA, introB] = t("ideas.intro", { name: "\u0000" }).split("\u0000");
  const [adA, adB] = t("ideas.adChannel.body", { link: "\u0000" }).split("\u0000");

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("ideas.title")}</h1>
          <p className="mt-1 text-sm text-stone-600">
            {introA}
            <span className="font-medium">{profile?.name ?? t("ideas.yourChannel")}</span>
            {introB}
          </p>
        </div>
        <Tabs<Mode>
          value={mode}
          onChange={setMode}
          items={[
            { value: "generate", label: t("ideas.tabs.generate") },
            { value: "evaluate", label: t("ideas.tabs.evaluate") },
          ]}
        />
      </div>
      {!profile || !channelData ? (
        <Spinner />
      ) : isAdChannel(profile) ? (
        <EmptyState icon={<Lightbulb className="size-8" />} title={t("ideas.adChannel.title")}>
          {adA}
          <Link href="/ads/new" className="font-medium text-brand-ink underline">
            {t("ideas.adChannel.link")}
          </Link>
          {adB}
        </EmptyState>
      ) : mode === "generate" ? (
        <>
          <SeriesStrip />
          <Generate profile={profile} channelId={channelData.channel.id} />
        </>
      ) : (
        <Evaluate profile={profile} />
      )}
    </main>
  );
}

function useIdeas() {
  return useQuery({ queryKey: ["ideas"], queryFn: () => api<{ ideas: Idea[] }>("/api/ideas") });
}

function useStartProject() {
  const router = useRouter();
  return useMutation({
    mutationFn: (body: { ideaId: string; title?: string; angle?: number; hook?: string }) =>
      api<{ projectId: string }>("/api/ideas", { json: { action: "start", ...body } }),
    onSuccess: ({ projectId }) => router.push(`/projects/${projectId}/script`),
  });
}

// ---------------- Series ----------------

const EPISODE_CHOICES = [2, 3, 4, 5, 6, 8, 10];

function usePlanSeries() {
  const router = useRouter();
  return useMutation({
    mutationFn: (body: { topic: string; episodes: number; ideaId?: string }) => api<{ series: Series }>("/api/series", { json: body }),
    onSuccess: ({ series }) => router.push(`/series/${series.id}`),
  });
}

/** Pick an episode count and plan a series. Planning takes a minute or two, so say so. */
function PlanSeriesControl({ topic, ideaId, onCancel }: { topic: string; ideaId?: string; onCancel?: () => void }) {
  const t = useT();
  const [episodes, setEpisodes] = useState(3);
  const plan = usePlanSeries();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={episodes} onChange={(e) => setEpisodes(Number(e.target.value))} className="h-8 w-auto text-sm" disabled={plan.isPending}>
          {EPISODE_CHOICES.map((n) => (
            <option key={n} value={n}>
              {t("series.episodesCount", { n })}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="primary" loading={plan.isPending} disabled={!topic.trim()} onClick={() => plan.mutate({ topic, episodes, ideaId })}>
          {t("series.plan")}
        </Button>
        {onCancel && !plan.isPending ? (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            ✕
          </Button>
        ) : null}
      </div>
      {plan.isPending ? <div className="text-xs text-stone-500">{t("series.planning")}</div> : null}
      <ErrorNote error={plan.error} />
    </div>
  );
}

/** Existing series of this channel, plus planning one from a free topic. */
function SeriesStrip() {
  const t = useT();
  const { data } = useQuery({ queryKey: ["series"], queryFn: () => api<{ series: Series[] }>("/api/series") });
  const [topic, setTopic] = useState("");
  const list = data?.series ?? [];
  return (
    <Card className="mb-6 p-4">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Layers className="size-4 text-stone-500" /> {t("series.yourSeries")}
          </div>
          {list.length ? (
            <div className="flex flex-wrap gap-1.5">
              {list.map((s) => (
                <Link key={s.id} href={`/series/${s.id}`} className="rounded-md bg-stone-100 px-2.5 py-1 text-sm hover:bg-stone-200">
                  {s.title} <span className="text-stone-500">· {t("series.episodesCount", { n: s.episodes.length })}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-sm text-stone-500">{t("series.empty")}</div>
          )}
        </div>
        <div className="w-full max-w-md space-y-2">
          <Label>{t("series.newFromTopic")}</Label>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("series.topicPlaceholder")} />
          {topic.trim() ? <PlanSeriesControl topic={topic} /> : null}
        </div>
      </div>
    </Card>
  );
}

// ---------------- Generate ----------------

/** Which angles idea generation may use. Remembered per channel in this browser. */
function useAngleChoice(channelId: string, profile: ChannelProfile) {
  const key = `ideas.angles.${channelId}`;
  const all = profile.topicAngles.map((a) => a.id);
  // Only rendered after the channel loads on the client, so reading storage here can't mismatch the server HTML.
  const [state, setState] = useState<{ ids: number[] | "all"; fresh: boolean }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      if (saved && (saved.ids === "all" || Array.isArray(saved.ids))) return { ids: saved.ids, fresh: Boolean(saved.fresh) };
    } catch {
      // private mode or bad JSON: keep the default
    }
    return { ids: "all", fresh: false };
  });
  const update = (next: typeof state) => {
    setState(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // not persisted; fine
    }
  };
  const selected = state.ids === "all" ? all : state.ids.filter((id) => all.includes(id));
  return {
    selected,
    fresh: state.fresh,
    toggle: (id: number) => update({ ...state, ids: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] }),
    setAll: () => update({ ...state, ids: "all" }),
    setNone: () => update({ ...state, ids: [] }),
    setFresh: (fresh: boolean) => update({ ...state, fresh }),
    // Undefined = every angle (also any added later); [] = none.
    angleIds: state.ids === "all" ? undefined : selected,
  };
}

function AngleChips({ profile, choice }: { profile: ChannelProfile; choice: ReturnType<typeof useAngleChoice> }) {
  const t = useT();
  const angles = profile.topicAngles;
  const chip = (on: boolean) =>
    cn(
      "rounded-full border px-2.5 py-1 text-xs transition-colors",
      on ? "border-orange-300 bg-orange-50 text-orange-800" : "border-stone-200 bg-white text-stone-500 hover:border-stone-300",
    );
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-stone-100 pt-3 text-xs">
      <span className="mr-1 text-stone-500">{t("ideas.angles.label")}</span>
      {angles.length ? (
        <>
          {angles.map((a) => (
            <button key={a.id} type="button" title={a.description} className={chip(choice.selected.includes(a.id))} onClick={() => choice.toggle(a.id)}>
              {a.name}
            </button>
          ))}
          <button type="button" className="px-1 text-stone-500 underline-offset-2 hover:underline" onClick={choice.setAll}>
            {t("ideas.angles.all")}
          </button>
          <button type="button" className="px-1 text-stone-500 underline-offset-2 hover:underline" onClick={choice.setNone}>
            {t("ideas.angles.none")}
          </button>
          <button
            type="button"
            className={chip(choice.fresh || !choice.selected.length)}
            disabled={!choice.selected.length}
            title={t("ideas.angles.freshTitle")}
            onClick={() => choice.setFresh(!choice.fresh)}
          >
            {t("ideas.angles.fresh")}
          </button>
        </>
      ) : (
        <span className="text-stone-500">{t("ideas.angles.noneSet")}</span>
      )}
      <Link href="/channel#angles" className="ml-auto text-stone-500 underline-offset-2 hover:underline">
        {t("ideas.angles.edit")}
      </Link>
    </div>
  );
}

function Generate({ profile, channelId }: { profile: ChannelProfile; channelId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const { data, isLoading } = useIdeas();
  const [seed, setSeed] = useState("");
  const [count, setCount] = useState(12);
  const angles = useAngleChoice(channelId, profile);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"new" | "score">("new");
  const [openId, setOpenId] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: (body: { seed?: string; likeTitle?: string }) => api("/api/ideas", { json: { action: "generate", count, fresh: angles.fresh, angleIds: angles.angleIds, ...body } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ideas"] }),
  });

  const ideas = useMemo(() => {
    let xs = data?.ideas ?? [];
    if (filter === "starred") xs = xs.filter((i) => i.starred);
    if (filter === "mine") xs = xs.filter((i) => i.source === "user");
    if (sort === "score") xs = [...xs].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return xs;
  }, [data, filter, sort]);

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            generate.mutate({ seed: seed.trim() || undefined });
          }}
        >
          <div className="min-w-[240px] flex-1">
            <Label hint={t("ideas.generate.optional")}>{t("ideas.generate.seed")}</Label>
            <Input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder={t("ideas.generate.seedPlaceholder")} />
          </div>
          <div className="w-28">
            <Label>{t("ideas.generate.howMany")}</Label>
            <Select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[6, 12, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="primary" type="submit" loading={generate.isPending} icon={<Sparkles className="size-4" />}>
            {generate.isPending ? t("ideas.generate.thinking") : t("ideas.generate.button")}
          </Button>
        </form>
        <AngleChips profile={profile} choice={angles} />
        {generate.error ? (
          <div className="mt-3">
            <ErrorNote error={generate.error} />
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          items={[
            { value: "all", label: t("ideas.filters.all", { count: data?.ideas.length ?? 0 }) },
            { value: "starred", label: t("ideas.filters.starred") },
            { value: "mine", label: t("ideas.filters.mine") },
          ]}
        />
        <Select value={sort} onChange={(e) => setSort(e.target.value as "new" | "score")} className="w-40">
          <option value="new">{t("ideas.sort.new")}</option>
          <option value="score">{t("ideas.sort.score")}</option>
        </Select>
      </div>

      {isLoading ? (
        <Spinner />
      ) : !ideas.length ? (
        <EmptyState icon={<Lightbulb className="size-8" />} title={filter === "all" ? t("ideas.empty.title") : t("ideas.empty.filteredTitle")}>
          {filter === "all" ? t("ideas.empty.body") : t("ideas.empty.filteredBody")}
        </EmptyState>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              profile={profile}
              open={openId === idea.id}
              onToggle={() => setOpenId(openId === idea.id ? null : idea.id)}
              onMoreLike={() => generate.mutate({ likeTitle: idea.title })}
              moreLoading={generate.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IdeaCard({
  idea,
  profile,
  open,
  onToggle,
  onMoreLike,
  moreLoading,
}: {
  idea: Idea;
  profile: ChannelProfile;
  open: boolean;
  onToggle: () => void;
  onMoreLike: () => void;
  moreLoading: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const start = useStartProject();
  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/ideas", { json: { ideaId: idea.id, ...body } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ideas"] }),
  });
  const evaluating = act.isPending && act.variables?.action === "evaluate";
  const [seriesOpen, setSeriesOpen] = useState(false);

  return (
    <Card className={cn("p-4", open && "lg:col-span-2")}>
      <div className="flex items-start gap-3">
        {idea.score != null ? <ScoreRing value={idea.score} size={44} /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="brand">{angleLabel(t, profile, idea.angle)}</Badge>
            {idea.source === "user" ? <Badge tone="blue">{t("ideas.card.myIdea")}</Badge> : null}
            {idea.evaluation ? <Badge tone={idea.evaluation.verdict === "go" ? "green" : idea.evaluation.verdict === "improve" ? "amber" : "red"}>{t("ideas.card.evaluated", { verdict: t(`ideas.verdicts.${idea.evaluation.verdict}.short`) })}</Badge> : null}
          </div>
          <div className="mt-1.5 font-medium leading-snug">{idea.title}</div>
          {idea.hook ? <div className="mt-1 text-sm italic text-stone-600">“{idea.hook}”</div> : null}
          {idea.whyViral ? <div className="mt-1 text-xs text-stone-500">{idea.whyViral}</div> : null}
        </div>
        <button
          aria-label={idea.starred ? t("ideas.card.unstar") : t("ideas.card.star")}
          onClick={() => act.mutate({ action: "star", starred: !idea.starred })}
          className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-amber-500"
        >
          <Star className={cn("size-4", idea.starred && "fill-amber-400 text-amber-500")} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="primary" loading={start.isPending} onClick={() => start.mutate({ ideaId: idea.id })}>
          {t("ideas.card.startVideo")}
        </Button>
        {idea.evaluation ? (
          <Button size="sm" variant="secondary" onClick={onToggle} icon={<ClipboardCheck className="size-3.5" />}>
            {open ? t("ideas.card.hideScorecard") : t("ideas.card.scorecard")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            loading={evaluating}
            icon={<ClipboardCheck className="size-3.5" />}
            onClick={() => act.mutate({ action: "evaluate", idea: idea.title }, { onSuccess: () => !open && onToggle() })}
          >
            {t("ideas.card.evaluate")}
          </Button>
        )}
        <Button size="sm" variant="ghost" loading={moreLoading} onClick={onMoreLike} icon={<Wand2 className="size-3.5" />}>
          {t("ideas.card.moreLike")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setSeriesOpen((v) => !v)} icon={<Layers className="size-3.5" />}>
          {t("series.makeSeries")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-stone-400 hover:text-red-600"
          aria-label={t("ideas.card.delete")}
          onClick={() => act.mutate({ action: "delete" })}
          icon={<Trash2 className="size-3.5" />}
        />
      </div>
      {seriesOpen ? (
        <div className="mt-3 border-t border-stone-200 pt-3">
          <PlanSeriesControl topic={idea.title} ideaId={idea.id} onCancel={() => setSeriesOpen(false)} />
        </div>
      ) : null}
      {act.error ? (
        <div className="mt-3">
          <ErrorNote error={act.error} />
        </div>
      ) : null}

      {open && idea.evaluation ? (
        <div className="mt-4 border-t border-stone-200 pt-4">
          <Scorecard
            evaluation={idea.evaluation}
            profile={profile}
            starting={start.isPending}
            onUse={(v) => start.mutate({ ideaId: idea.id, ...v })}
          />
        </div>
      ) : null}
    </Card>
  );
}

// ---------------- Evaluate my idea ----------------

function Evaluate({ profile }: { profile: ChannelProfile }) {
  const t = useT();
  const qc = useQueryClient();
  const start = useStartProject();
  const [idea, setIdea] = useState("");
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState("");
  const [current, setCurrent] = useState<Idea | null>(null);

  const evaluate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ idea: Idea }>("/api/ideas", { json: { action: "evaluate", ...body } }),
    onSuccess: ({ idea }) => {
      setCurrent(idea);
      setFeedback("");
      qc.invalidateQueries({ queryKey: ["ideas"] });
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <Card className="h-fit p-5">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            evaluate.mutate({ idea, notes: notes || undefined });
          }}
        >
          <div>
            <Label>{t("ideas.evaluate.yourIdea")}</Label>
            <Textarea
              rows={3}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder={t("ideas.evaluate.ideaPlaceholder")}
            />
          </div>
          <div>
            <Label hint={t("ideas.generate.optional")}>{t("ideas.evaluate.notes")}</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("ideas.evaluate.notesPlaceholder")} />
          </div>
          <Button variant="primary" type="submit" className="w-full" loading={evaluate.isPending && !current} disabled={!idea.trim()}>
            {t("ideas.evaluate.submit")}
          </Button>
          <p className="text-xs leading-relaxed text-stone-500">
            {t("ideas.evaluate.help")}
          </p>
        </form>
        <ErrorNote error={evaluate.error} />
      </Card>

      <div>
        {!current ? (
          evaluate.isPending ? (
            <Card className="flex items-center gap-3 p-6 text-sm text-stone-600">
              <Spinner /> {t("ideas.evaluate.reading")}
            </Card>
          ) : (
            <EmptyState icon={<ClipboardCheck className="size-8" />} title={t("ideas.evaluate.emptyTitle")}>
              {t("ideas.evaluate.emptyBody")}
            </EmptyState>
          )
        ) : (
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{t("ideas.evaluate.scorecard")}</div>
                <div className="mt-0.5 text-lg font-semibold leading-snug">{current.title}</div>
              </div>
              <Button variant="primary" loading={start.isPending} onClick={() => start.mutate({ ideaId: current.id })}>
                {t("ideas.evaluate.useAsIs")}
              </Button>
            </div>
            {current.evaluation ? (
              <Scorecard
                evaluation={current.evaluation}
                profile={profile}
                starting={start.isPending}
                onUse={(v) => start.mutate({ ideaId: current.id, ...v })}
              />
            ) : null}
            <form
              className="mt-6 flex flex-wrap items-end gap-2 border-t border-stone-200 pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                evaluate.mutate({ idea: current.title, notes: notes || undefined, feedback, ideaId: current.id });
              }}
            >
              <div className="min-w-[240px] flex-1">
                <Label>{t("ideas.evaluate.refine")}</Label>
                <Input
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder={t("ideas.evaluate.refinePlaceholder")}
                />
              </div>
              <Button type="submit" loading={evaluate.isPending} disabled={!feedback.trim()}>
                {t("ideas.evaluate.reEvaluate")}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
