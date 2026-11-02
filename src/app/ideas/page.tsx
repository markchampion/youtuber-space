"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Lightbulb, Sparkles, Star, Trash2, Wand2 } from "lucide-react";
import { api, useChannel, type Idea } from "@/lib/client";
import { angleName, isAdChannel, type ChannelProfile } from "@/lib/channel";
import { Scorecard, ScoreRing } from "@/components/scorecard";
import { Badge, Button, Card, EmptyState, ErrorNote, Input, Label, Select, Spinner, Tabs, Textarea, cn } from "@/components/ui";

type Mode = "generate" | "evaluate";
type Filter = "all" | "starred" | "mine";

export default function IdeasPage() {
  const [mode, setMode] = useState<Mode>("generate");
  const { data: channelData } = useChannel();
  const profile = channelData?.channel.profile;

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ideas</h1>
          <p className="mt-1 text-sm text-stone-600">
            Generate ideas for <span className="font-medium">{profile?.name ?? "your channel"}</span>, or score your own before you commit.
          </p>
        </div>
        <Tabs<Mode>
          value={mode}
          onChange={setMode}
          items={[
            { value: "generate", label: "Generate ideas" },
            { value: "evaluate", label: "Evaluate my idea" },
          ]}
        />
      </div>
      {!profile || !channelData ? (
        <Spinner />
      ) : isAdChannel(profile) ? (
        <EmptyState icon={<Lightbulb className="size-8" />} title="Product-ad channels don't use ideas">
          Each ad starts from a product photo and a short brief.{" "}
          <Link href="/ads/new" className="font-medium text-brand-ink underline">
            Make a new ad
          </Link>
          .
        </EmptyState>
      ) : mode === "generate" ? (
        <Generate profile={profile} channelId={channelData.channel.id} />
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
  const angles = profile.topicAngles;
  const chip = (on: boolean) =>
    cn(
      "rounded-full border px-2.5 py-1 text-xs transition-colors",
      on ? "border-orange-300 bg-orange-50 text-orange-800" : "border-stone-200 bg-white text-stone-500 hover:border-stone-300",
    );
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-stone-100 pt-3 text-xs">
      <span className="mr-1 text-stone-500">Angles</span>
      {angles.length ? (
        <>
          {angles.map((a) => (
            <button key={a.id} type="button" title={a.description} className={chip(choice.selected.includes(a.id))} onClick={() => choice.toggle(a.id)}>
              {a.name}
            </button>
          ))}
          <button type="button" className="px-1 text-stone-500 underline-offset-2 hover:underline" onClick={choice.setAll}>
            All
          </button>
          <button type="button" className="px-1 text-stone-500 underline-offset-2 hover:underline" onClick={choice.setNone}>
            None
          </button>
          <button
            type="button"
            className={chip(choice.fresh || !choice.selected.length)}
            disabled={!choice.selected.length}
            title="Also let the AI invent title formulas beyond your angles"
            onClick={() => choice.setFresh(!choice.fresh)}
          >
            + Fresh formulas
          </button>
        </>
      ) : (
        <span className="text-stone-500">None set: the AI invents its own title formulas.</span>
      )}
      <Link href="/channel#angles" className="ml-auto text-stone-500 underline-offset-2 hover:underline">
        Edit angles
      </Link>
    </div>
  );
}

function Generate({ profile, channelId }: { profile: ChannelProfile; channelId: string }) {
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
            <Label hint="optional">Theme or seed</Label>
            <Input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="e.g. sleep, childbirth, Ice Age winters…" />
          </div>
          <div className="w-28">
            <Label>How many</Label>
            <Select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[6, 12, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="primary" type="submit" loading={generate.isPending} icon={<Sparkles className="size-4" />}>
            {generate.isPending ? "Thinking…" : "Generate ideas"}
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
            { value: "all", label: `All (${data?.ideas.length ?? 0})` },
            { value: "starred", label: "Starred" },
            { value: "mine", label: "My ideas" },
          ]}
        />
        <Select value={sort} onChange={(e) => setSort(e.target.value as "new" | "score")} className="w-40">
          <option value="new">Newest first</option>
          <option value="score">Highest score</option>
        </Select>
      </div>

      {isLoading ? (
        <Spinner />
      ) : !ideas.length ? (
        <EmptyState icon={<Lightbulb className="size-8" />} title={filter === "all" ? "No ideas yet" : "Nothing here"}>
          {filter === "all" ? "Generate a batch above. Ideas you've already used are excluded from new batches." : "Try another filter."}
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
  const qc = useQueryClient();
  const start = useStartProject();
  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/ideas", { json: { ideaId: idea.id, ...body } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ideas"] }),
  });
  const evaluating = act.isPending && act.variables?.action === "evaluate";

  return (
    <Card className={cn("p-4", open && "lg:col-span-2")}>
      <div className="flex items-start gap-3">
        {idea.score != null ? <ScoreRing value={idea.score} size={44} /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="brand">{angleName(profile, idea.angle)}</Badge>
            {idea.source === "user" ? <Badge tone="blue">My idea</Badge> : null}
            {idea.evaluation ? <Badge tone={idea.evaluation.verdict === "go" ? "green" : idea.evaluation.verdict === "improve" ? "amber" : "red"}>Evaluated: {idea.evaluation.verdict}</Badge> : null}
          </div>
          <div className="mt-1.5 font-medium leading-snug">{idea.title}</div>
          {idea.hook ? <div className="mt-1 text-sm italic text-stone-600">“{idea.hook}”</div> : null}
          {idea.whyViral ? <div className="mt-1 text-xs text-stone-500">{idea.whyViral}</div> : null}
        </div>
        <button
          aria-label={idea.starred ? "Unstar" : "Star"}
          onClick={() => act.mutate({ action: "star", starred: !idea.starred })}
          className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-amber-500"
        >
          <Star className={cn("size-4", idea.starred && "fill-amber-400 text-amber-500")} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="primary" loading={start.isPending} onClick={() => start.mutate({ ideaId: idea.id })}>
          Start video
        </Button>
        {idea.evaluation ? (
          <Button size="sm" variant="secondary" onClick={onToggle} icon={<ClipboardCheck className="size-3.5" />}>
            {open ? "Hide scorecard" : "Scorecard"}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            loading={evaluating}
            icon={<ClipboardCheck className="size-3.5" />}
            onClick={() => act.mutate({ action: "evaluate", idea: idea.title }, { onSuccess: () => !open && onToggle() })}
          >
            Evaluate
          </Button>
        )}
        <Button size="sm" variant="ghost" loading={moreLoading} onClick={onMoreLike} icon={<Wand2 className="size-3.5" />}>
          More like this
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-stone-400 hover:text-red-600"
          aria-label="Delete idea"
          onClick={() => act.mutate({ action: "delete" })}
          icon={<Trash2 className="size-3.5" />}
        />
      </div>
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
            <Label>Your idea</Label>
            <Textarea
              rows={3}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="A working title or a rough idea, e.g. “How did cavemen deal with toothache?”"
            />
          </div>
          <div>
            <Label hint="optional">Notes, angle, sources you have in mind</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the evaluator should know" />
          </div>
          <Button variant="primary" type="submit" className="w-full" loading={evaluate.isPending && !current} disabled={!idea.trim()}>
            Evaluate idea
          </Button>
          <p className="text-xs leading-relaxed text-stone-500">
            It&apos;s scored against your channel profile on niche fit, hook strength, available evidence, story potential, visual fit and title
            clarity. Then you get sharper versions to pick from.
          </p>
        </form>
        <ErrorNote error={evaluate.error} />
      </Card>

      <div>
        {!current ? (
          evaluate.isPending ? (
            <Card className="flex items-center gap-3 p-6 text-sm text-stone-600">
              <Spinner /> Reading your idea against the channel profile…
            </Card>
          ) : (
            <EmptyState icon={<ClipboardCheck className="size-8" />} title="Your scorecard shows up here">
              Evaluated ideas are saved under Ideas → My ideas, so you can come back to them.
            </EmptyState>
          )
        ) : (
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Scorecard</div>
                <div className="mt-0.5 text-lg font-semibold leading-snug">{current.title}</div>
              </div>
              <Button variant="primary" loading={start.isPending} onClick={() => start.mutate({ ideaId: current.id })}>
                Use as-is
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
                <Label>Refine</Label>
                <Input
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="e.g. keep it about the Ice Age, make it less gory"
                />
              </div>
              <Button type="submit" loading={evaluate.isPending} disabled={!feedback.trim()}>
                Re-evaluate
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
