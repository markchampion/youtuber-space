"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, Pause, Play, Plus, RefreshCw, Search, Trash2, Volume2 } from "lucide-react";
import { api, lastJob, runningJob, useProject, useProjectAction, type ProjectData } from "@/lib/client";
import { DEFAULT_VOICE_SETTINGS, type VoiceSettings } from "@/lib/channel";
import { getLanguage } from "@/lib/languages";
import { JobBar, StaleBanner, StepFooter, StepHeader } from "@/components/step";
import { Badge, Button, Card, EmptyState, ErrorNote, Input, Label, Select, Spinner, cn, fmtTime } from "@/components/ui";
import { useT, type T, type TKey } from "@/lib/i18n";

/** Fill `{key}` in an already-translated text with a React node (e.g. a bold word). */
function withNode(text: string, key: string, node: ReactNode) {
  const [before, after] = text.split(`{${key}}`);
  return (
    <>
      {before}
      {node}
      {after}
    </>
  );
}

type Voice = { id: string; name: string; description?: string; previewUrl?: string; labels?: Record<string, string>; languages: string[]; featured?: boolean };

export default function VoicePage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useProject(id);
  const act = useProjectAction(id);
  const t = useT();

  if (!data) return <Spinner />;
  const needs = data.paragraphs.filter((p) => p.needsVoice);
  const running = runningJob(data, "voice");
  const job = running ?? lastJob(data, "voice");
  const scriptApproved = Boolean(data.project.approvals.script);
  const voiceId = data.project.voiceOverride?.voiceId ?? data.channel.voiceId;
  const autopilot = runningJob(data, "autopilot");

  return (
    <div>
      <StepHeader
        title={t("voice.title")}
        description={t("voice.description")}
      />
      <StaleBanner data={data} step="voice">
        {withNode(t("voice.stale"), "needsVoice", <b>{t("voice.para.needsVoice")}</b>)}
      </StaleBanner>

      {!scriptApproved ? (
        <EmptyState icon={<Mic className="size-8" />} title={t("voice.approveFirst")}>
          {t("voice.approveFirstBody")}
        </EmptyState>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-4">
            <VoiceSettingsCard data={data} />
            <PronunciationCard data={data} />
          </div>

          <div className="min-w-0 space-y-4">
            <Card className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1 text-sm">
                {needs.length ? (
                  <>
                    {withNode(t("voice.needsOf", { total: data.paragraphs.length }), "count", <span className="font-medium">{needs.length}</span>)}
                    <span className="text-stone-500">{t("voice.chars", { count: needs.reduce((a, p) => a + p.text.length, 0) })}</span>
                  </>
                ) : (
                  <span className="text-emerald-700">{t("voice.allVoiced", { total: data.paragraphs.length })}</span>
                )}
              </div>
              <Button
                variant={data.project.renderPath ? "secondary" : "primary"}
                icon={<Mic className="size-4" />}
                loading={Boolean(running) || (act.isPending && act.variables?.action === "voice")}
                disabled={!needs.length || !voiceId || Boolean(autopilot)}
                title={!voiceId ? t("voice.pickFirst") : undefined}
                onClick={() => act.mutate({ action: "voice" })}
              >
                {data.project.audioPath ? t("voice.voiceChanged") : t("voice.generate")}
              </Button>
              {data.project.renderPath ? (
                <Button
                  variant="primary"
                  icon={<RefreshCw className="size-4" />}
                  loading={Boolean(autopilot) || (act.isPending && act.variables?.action === "revoice")}
                  disabled={!voiceId || Boolean(running)}
                  title={t("voice.revoiceTitle")}
                  onClick={() => {
                    if (confirm(t("voice.revoiceConfirm"))) act.mutate({ action: "revoice" });
                  }}
                >
                  {t("voice.revoice")}
                </Button>
              ) : null}
            </Card>
            <JobBar job={job} />
            <ErrorNote error={act.error} />

            {data.audioUrl ? <FullTrack data={data} /> : null}

            <div className="space-y-2">
              {data.paragraphs.map((p) => (
                <ParagraphRow key={p.id} data={data} p={p} busy={Boolean(running)} />
              ))}
            </div>
          </div>
        </div>
      )}

      <StepFooter
        data={data}
        step="voice"
        canApprove={Boolean(data.project.audioPath) && !needs.length && !running}
        hint={t("voice.footerHint")}
      />
    </div>
  );
}

type Scope = "video" | "channel";

/** Where voice changes are saved: this video only (an override), or the channel's default for every video. */
function VoiceSettingsCard({ data }: { data: ProjectData }) {
  const override = data.project.voiceOverride;
  const [scope, setScope] = useState<Scope>(override ? "video" : "channel");
  const effective = {
    voiceId: (scope === "video" ? override?.voiceId : null) ?? data.channel.voiceId,
    settings: (scope === "video" ? override?.settings : null) ?? data.channel.voiceSettings ?? DEFAULT_VOICE_SETTINGS,
  };
  return (
    <VoiceSettingsForm
      key={`${scope}:${effective.voiceId}:${JSON.stringify(effective.settings)}`}
      data={data}
      scope={scope}
      setScope={setScope}
      voiceId={effective.voiceId}
      initialSettings={effective.settings}
    />
  );
}

function VoiceSettingsForm({
  data,
  scope,
  setScope,
  voiceId,
  initialSettings,
}: {
  data: ProjectData;
  scope: Scope;
  setScope: (s: Scope) => void;
  voiceId: string | null;
  initialSettings: VoiceSettings;
}) {
  const qc = useQueryClient();
  const act = useProjectAction(data.project.id);
  const t = useT();
  const local = data.ttsBackend === "local";
  const voices = useQuery({
    queryKey: ["voices", data.ttsBackend],
    queryFn: () => api<{ voices: Voice[] }>("/api/voices"),
    staleTime: 5 * 60_000,
    retry: local ? 0 : 1, // a stopped local server should say so right away
  });
  const [settings, setSettings] = useState<VoiceSettings>(initialSettings);
  const saveChannel = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/channel", { method: "PUT", json: body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", data.project.id] });
      qc.invalidateQueries({ queryKey: ["channel"] });
    },
  });
  const override = data.project.voiceOverride;
  const save = {
    mutate: (body: { voiceId?: string | null; voiceSettings?: VoiceSettings }) => {
      if (scope === "channel") return saveChannel.mutate(body);
      act.mutate({
        action: "setVoiceOverride",
        override: {
          voiceId: "voiceId" in body ? body.voiceId : (override?.voiceId ?? voiceId),
          settings: body.voiceSettings ?? override?.settings ?? settings,
        },
      });
    },
  };
  const current = voices.data?.voices.find((v) => v.id === voiceId);
  const lang = getLanguage(data.channel.profile.language);
  // Voices verified for the channel language first (multilingual voices can still read it).
  const sorted = [...(voices.data?.voices ?? [])].sort((a, b) => Number(b.languages.includes(lang.code)) - Number(a.languages.includes(lang.code)));
  const speaks = (v: Voice) => v.languages.includes(lang.code);
  const preview = useRef<HTMLAudioElement | null>(null);
  const [finder, setFinder] = useState(false);

  const slider = (key: keyof VoiceSettings, label: string, min: number, max: number, step: number, hint: string) => (
    <div>
      <Label hint={settings[key].toFixed(2)}>{label}</Label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={settings[key]}
        onChange={(e) => setSettings({ ...settings, [key]: Number(e.target.value) })}
        onPointerUp={() => save.mutate({ voiceSettings: settings })}
        onKeyUp={() => save.mutate({ voiceSettings: settings })}
        className="w-full"
        aria-label={label}
      />
      <div className="text-[11px] text-stone-500">{hint}</div>
    </div>
  );

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center gap-2 font-medium">
        <Volume2 className="size-4 text-stone-500" /> {t("voice.settings.title")}
        <div className="ml-auto flex rounded-lg bg-stone-100 p-0.5 text-xs font-normal">
          {(["channel", "video"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={cn("rounded-md px-2 py-1", scope === s ? "bg-white shadow-sm ring-1 ring-stone-200" : "text-stone-500 hover:text-stone-800")}
            >
              {s === "channel" ? t("voice.settings.channelDefault") : t("voice.settings.videoOnly")}
            </button>
          ))}
        </div>
      </div>
      {scope === "video" ? (
        <div className="rounded-lg bg-orange-50 p-2.5 text-[12px] text-orange-900 ring-1 ring-orange-200">
          {override ? t("voice.settings.ownVoice") : t("voice.settings.videoOnlyNote")}
          {override ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" onClick={() => act.mutate({ action: "makeVoiceDefault" })}>
                {t("voice.settings.makeDefault")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => act.mutate({ action: "setVoiceOverride", override: null })}>
                {t("voice.settings.reset")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : override ? (
        <p className="text-[11px] text-stone-500">{t("voice.settings.overrideNote")}</p>
      ) : null}
      <div>
        <Label hint={scope === "channel" ? t("voice.settings.savedForChannel") : t("voice.settings.thisVideoOnly")}>{t("voice.settings.narrator")}</Label>
        <div className="flex gap-2">
          <Select value={voiceId ?? ""} onChange={(e) => save.mutate({ voiceId: e.target.value || null })} disabled={voices.isLoading}>
            <option value="">{voices.isLoading ? t("voice.settings.loadingVoices") : t("voice.settings.pickVoice")}</option>
            {sorted.map((v) => (
              <option key={v.id} value={v.id}>
                {local ? (v.featured ? "★ " : "") : lang.code !== "en" && speaks(v) ? "✓ " : ""}
                {v.name}
                {local && v.description ? ` · ${v.description}` : ""}
                {v.labels?.accent ? ` · ${v.labels.accent}` : ""}
                {v.labels?.gender ? ` · ${v.labels.gender}` : ""}
              </option>
            ))}
          </Select>
          {current?.previewUrl ? (
            <Button
              variant="secondary"
              aria-label={t("voice.settings.preview")}
              onClick={() => {
                preview.current?.pause();
                preview.current = new Audio(current.previewUrl);
                void preview.current.play();
              }}
              icon={<Play className="size-4" />}
            />
          ) : null}
        </div>
        {voices.error ? <ErrorNote error={voices.error} /> : null}
        {local ? (
          <p className="mt-1 text-[11px] text-stone-500">
            {t("voice.settings.localNote")}
            {voices.error ? (
              <Button size="sm" variant="ghost" className="mt-1" icon={<RefreshCw className="size-3.5" />} onClick={() => voices.refetch()}>
                {t("common.retry")}
              </Button>
            ) : null}
          </p>
        ) : null}
        {local ? null : lang.code !== "en" ? (
          <p className="mt-1 text-[11px] text-stone-500">
            {t("voice.settings.langNote", { lang: lang.name })}
          </p>
        ) : null}
        {local ? null : lang.code !== "en" && voices.data && !voices.data.voices.some(speaks) && !finder ? (
          <div className="mt-2 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900 ring-1 ring-amber-200">
            {t("voice.settings.noNative", { lang: lang.name })}
            <Button size="sm" variant="primary" className="mt-2 block" icon={<Search className="size-3.5" />} onClick={() => setFinder(true)}>
              {t("voice.settings.find", { lang: lang.name })}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="mt-1" icon={<Search className="size-3.5" />} onClick={() => setFinder(!finder)}>
            {finder ? t("voice.settings.hideLibrary") : t("voice.settings.find", { lang: lang.name })}
          </Button>
        )}
        {finder && !local ? (
          <VoiceLibrary
            language={lang.code}
            languageName={lang.name}
            onPreview={(url) => {
              preview.current?.pause();
              preview.current = new Audio(url);
              void preview.current.play();
            }}
            onPicked={(voiceId) => {
              save.mutate({ voiceId });
              qc.invalidateQueries({ queryKey: ["voices"] });
            }}
          />
        ) : null}
      </div>
      {local ? null : (
        <>
          {slider("stability", t("voice.settings.stability"), 0, 1, 0.05, t("voice.settings.stabilityHint"))}
          {slider("similarityBoost", t("voice.settings.similarity"), 0, 1, 0.05, t("voice.settings.similarityHint"))}
          {slider("style", t("voice.settings.style"), 0, 1, 0.05, t("voice.settings.styleHint"))}
          {slider("speed", t("voice.settings.speed"), 0.7, 1.2, 0.01, t("voice.settings.speedHint"))}
        </>
      )}
      <p className="text-[11px] text-stone-500">
        {t("voice.settings.changeNote")}
      </p>
    </Card>
  );
}

function PronunciationCard({ data }: { data: ProjectData }) {
  const qc = useQueryClient();
  const t = useT();
  const [rows, setRows] = useState<[string, string][]>(Object.entries(data.channel.pronunciations ?? {}));
  const save = useMutation({
    mutationFn: (next: [string, string][]) =>
      api("/api/channel", { method: "PUT", json: { pronunciations: Object.fromEntries(next.filter(([k, v]) => k.trim() && v.trim())) } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", data.project.id] }),
  });
  const set = (i: number, j: 0 | 1, v: string) => setRows(rows.map((r, k) => (k === i ? (j === 0 ? [v, r[1]] : [r[0], v]) : r)));

  return (
    <Card className="space-y-3 p-4">
      <div>
        <div className="font-medium">{t("voice.pron.title")}</div>
        <p className="text-xs text-stone-500">{t("voice.pron.help")}</p>
      </div>
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input className="h-8 text-[13px]" value={k} placeholder="Wiessner" onChange={(e) => set(i, 0, e.target.value)} onBlur={() => save.mutate(rows)} />
          <span className="text-stone-400">→</span>
          <Input className="h-8 text-[13px]" value={v} placeholder="Veesner" onChange={(e) => set(i, 1, e.target.value)} onBlur={() => save.mutate(rows)} />
          <Button
            size="sm"
            variant="ghost"
            aria-label={t("common.remove")}
            onClick={() => {
              const next = rows.filter((_, k) => k !== i);
              setRows(next);
              save.mutate(next);
            }}
            icon={<Trash2 className="size-3.5" />}
          />
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => setRows([...rows, ["", ""]])} icon={<Plus className="size-3.5" />}>
        {t("voice.pron.add")}
      </Button>
    </Card>
  );
}

function ParagraphRow({ data, p, busy }: { data: ProjectData; p: ProjectData["paragraphs"][number]; busy: boolean }) {
  const act = useProjectAction(data.project.id);
  const t = useT();
  const sentences = data.sentences.filter((s) => s.paragraphIdx === p.idx);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  return (
    <Card className="p-3.5">
      <div className="flex items-start gap-3">
        <Button
          size="sm"
          variant="secondary"
          disabled={!p.audioUrl}
          aria-label={playing ? t("voice.para.pause") : t("voice.para.play")}
          onClick={() => {
            if (!p.audioUrl) return;
            if (!audio.current || audio.current.src !== new URL(p.audioUrl, location.href).href) {
              audio.current?.pause();
              audio.current = new Audio(p.audioUrl);
              audio.current.onended = () => setPlaying(false);
            }
            if (playing) audio.current.pause();
            else void audio.current.play();
            setPlaying(!playing);
          }}
          icon={playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-stone-500">
            <span>¶ {p.idx + 1}</span>
            {p.status === "generating" ? (
              <Badge tone="brand">{t("voice.para.voicing")}</Badge>
            ) : p.status === "error" ? (
              <Badge tone="red">{t("voice.para.error")}</Badge>
            ) : p.needsVoice ? (
              <Badge tone="amber">{t("voice.para.needsVoice")}</Badge>
            ) : (
              <Badge tone="green">{p.sampleCount && p.sampleRate ? fmtTime(p.sampleCount / p.sampleRate) : t("voice.para.done")}</Badge>
            )}
          </div>
          <p className="text-[14px] leading-6 text-stone-800">{p.text}</p>
          {p.error ? <div className="mt-1 text-xs text-red-700">{p.error}</div> : null}
          {sentences.some((s) => s.start != null) ? (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-stone-400">
              {sentences.map((s) => (
                <span key={s.id}>
                  {fmtTime(s.start)}–{fmtTime(s.end)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !data.channel.voiceId}
          loading={act.isPending}
          onClick={() => act.mutate({ action: "voice", paragraphIds: [p.id] })}
          icon={<RefreshCw className="size-3.5" />}
        >
          {t("voice.para.redo")}
        </Button>
      </div>
    </Card>
  );
}

/** Full stitched track with the spoken sentence highlighted (karaoke-style). */
function FullTrack({ data }: { data: ProjectData }) {
  const act = useProjectAction(data.project.id);
  const tr = useT();
  const audio = useRef<HTMLAudioElement>(null);
  const [t, setT] = useState(0);
  const [pause, setPauseMs] = useState(data.project.pauseMs);
  const sentences = data.sentences;
  const current = useMemo(() => {
    let k = -1;
    for (let i = 0; i < sentences.length; i++) if ((sentences[i].start ?? Infinity) <= t) k = i;
    return k;
  }, [t, sentences]);
  const activeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (audio.current) setT(audio.current.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    if (!audio.current?.paused) activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current]);

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="font-medium">{tr("voice.track.title")}</div>
        <span className="text-sm tabular-nums text-stone-500">{fmtTime(data.project.audioDuration)}</span>
        <div className="ml-auto flex items-center gap-2 text-xs text-stone-600">
          <label htmlFor="pause">{tr("voice.track.pause")}</label>
          <input
            id="pause"
            type="range"
            min={0}
            max={1200}
            step={50}
            value={pause}
            onChange={(e) => setPauseMs(Number(e.target.value))}
            onPointerUp={() => act.mutate({ action: "setPause", pauseMs: pause })}
            className="w-28"
          />
          <span className="w-12 tabular-nums">{pause} ms</span>
        </div>
      </div>
      <audio ref={audio} src={data.audioUrl ?? undefined} controls className="w-full" preload="auto" />
      <div className="mt-3 max-h-72 overflow-y-auto rounded-lg bg-stone-50 p-3 text-[14px] leading-7">
        {sentences.map((s, i) => (
          <span
            key={s.id}
            ref={i === current ? activeRef : undefined}
            onClick={() => {
              if (audio.current && s.start != null) {
                audio.current.currentTime = s.start;
                void audio.current.play();
              }
            }}
            className={cn(
              "cursor-pointer rounded px-0.5 transition-colors",
              i === current ? "bg-orange-200 text-stone-900" : "text-stone-700 hover:bg-stone-200",
            )}
          >
            {s.text}{" "}
          </span>
        ))}
      </div>
    </Card>
  );
}

type LibraryVoice = {
  publicOwnerId: string;
  voiceId: string;
  name: string;
  accent?: string;
  gender?: string;
  age?: string;
  descriptive?: string;
  useCase?: string;
  description?: string;
  previewUrl?: string;
  clonedByCount: number;
  usage1y: number;
  usage7d: number;
  freeUsersAllowed: boolean;
  fiatRate?: number;
  isAddedByUser: boolean;
};

type LibrarySort = "usage_character_count_1y" | "trending" | "cloned_by_count" | "created_date";
const SORTS: { value: LibrarySort; label: TKey }[] = [
  { value: "usage_character_count_1y", label: "voice.library.sortUsage" },
  { value: "trending", label: "voice.library.sortTrending" },
  { value: "cloned_by_count", label: "voice.library.sortCloned" },
  { value: "created_date", label: "voice.library.sortNewest" },
];

/** Browse the ElevenLabs Voice Library for native speakers of the channel language. */
function VoiceLibrary({
  language,
  languageName,
  onPreview,
  onPicked,
}: {
  language: string;
  languageName: string;
  onPreview: (url: string) => void;
  onPicked: (voiceId: string) => void;
}) {
  const t = useT();
  const compact = useMemo(() => new Intl.NumberFormat(t.locale, { notation: "compact", maximumFractionDigits: 1 }), [t.locale]);
  const [gender, setGender] = useState("");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [price, setPrice] = useState<"" | "free" | "included">("");
  const [sort, setSort] = useState<LibrarySort>("usage_character_count_1y");
  const lib = useInfiniteQuery({
    queryKey: ["voice-library", language, gender, search, sort],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<{ voices: LibraryVoice[]; hasMore: boolean; plan: string | null }>(
        `/api/voices?${new URLSearchParams({ library: "1", language, gender, search, sort, page: String(pageParam) })}`,
      ),
    getNextPageParam: (last, all) => (last.hasMore ? all.length : undefined),
    staleTime: 10 * 60_000,
  });
  const add = useMutation({
    mutationFn: (v: LibraryVoice) => api<{ voiceId: string }>("/api/voices", { json: { action: "addLibrary", publicOwnerId: v.publicOwnerId, voiceId: v.voiceId, name: v.name } }),
    onSuccess: (r) => onPicked(r.voiceId),
  });
  const plan = lib.data?.pages[0]?.plan ?? null;
  const all = lib.data?.pages.flatMap((p) => p.voices) ?? [];
  const list = all.filter((v) => {
    const c = costOf(v, plan);
    return !price || (price === "free" ? c.kind === "free" : c.kind !== "extra" && c.kind !== "blocked");
  });

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200">
      <div className="text-[13px] font-medium">{t("voice.library.title", { lang: languageName })}</div>
      <p className="text-[11px] text-stone-500">
        {t("voice.library.intro")}
        {plan ? withNode(t("voice.library.plan"), "plan", <b className="capitalize">{plan.replace(/_/g, " ")}</b>) : null}
      </p>
      {plan === "free" ? (
        <div className="rounded-md bg-amber-50 p-2 text-[12px] text-amber-900 ring-1 ring-amber-200">
          {withNode(t("voice.library.freePlan"), "free", <b>{t("voice.library.freeName")}</b>)}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5 text-[11px] text-stone-600">
        <Badge tone="green">{t("voice.cost.free")}</Badge> {t("voice.library.legendFree")}
        <Badge tone="blue">{t("voice.cost.paid")}</Badge> {t("voice.library.legendPaid")}
        <Badge tone="amber">{t("voice.cost.extraShort")}</Badge> {t("voice.library.legendExtra")}
      </div>
      {/* Lives in a narrow (340 px) column: search on its own row, then two filters per row. */}
      <form
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(draft);
        }}
      >
        <div className="flex gap-1.5">
          <Input className="min-w-0 flex-1" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("voice.library.searchPlaceholder")} />
          <Button type="submit" size="sm" variant="secondary" icon={<Search className="size-3.5" />} aria-label={t("voice.library.search")} />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Select className="w-full min-w-0" value={gender} onChange={(e) => setGender(e.target.value)} aria-label={t("voice.library.gender")}>
            <option value="">{t("voice.library.anyGender")}</option>
            <option value="female">{t("voice.library.female")}</option>
            <option value="male">{t("voice.library.male")}</option>
          </Select>
          <Select className="w-full min-w-0" value={price} onChange={(e) => setPrice(e.target.value as typeof price)} aria-label={t("voice.library.price")}>
            <option value="">{t("voice.library.anyPrice")}</option>
            <option value="free">{t("voice.library.noExtra")}</option>
            <option value="included">{t("voice.library.onPlan")}</option>
          </Select>
          <Select className="col-span-2 w-full min-w-0" value={sort} onChange={(e) => setSort(e.target.value as LibrarySort)} aria-label={t("voice.library.sort")}>
            {SORTS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.label)}
              </option>
            ))}
          </Select>
        </div>
      </form>
      <ErrorNote error={lib.error ?? add.error} />
      {lib.isLoading ? <Spinner /> : null}
      {!lib.isLoading && !list.length && !lib.error ? (
        <p className="text-[13px] text-stone-500">{all.length ? t("voice.library.noMatch") : t("voice.library.noneFound")}</p>
      ) : null}
      <ul className="max-h-96 space-y-1.5 overflow-y-auto">
        {list.map((v) => (
          <li key={`${v.publicOwnerId}-${v.voiceId}`} className="space-y-1.5 rounded-md bg-white p-2 ring-1 ring-stone-200">
            <div className="flex items-start gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!v.previewUrl}
                onClick={() => v.previewUrl && onPreview(v.previewUrl)}
                aria-label={t("voice.library.previewName", { name: v.name })}
                icon={<Play className="size-3.5" />}
              />
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[13px] font-medium leading-snug" title={v.name}>
                  {v.name}
                </div>
                <div className="text-[11px] text-stone-500">
                  {[v.gender, v.age?.replace("_", " "), v.accent, v.descriptive, v.useCase?.replace(/_/g, " ")].filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {v.isAddedByUser ? <Badge tone="green">{t("voice.library.inAccount")}</Badge> : null}
              <PriceBadge t={t} cost={costOf(v, plan)} />
              {sort === "trending" ? (
                v.usage7d > 0 ? <Badge title={t("voice.library.weekTitle")}>{t("voice.library.perWeek", { n: compact.format(v.usage7d) })}</Badge> : null
              ) : v.usage1y > 0 ? (
                <Badge title={t("voice.library.yearTitle")}>{t("voice.library.perYear", { n: compact.format(v.usage1y) })}</Badge>
              ) : null}
              {v.clonedByCount > 0 ? <Badge>{t("voice.library.users", { n: compact.format(v.clonedByCount) })}</Badge> : null}
              <Button
                size="sm"
                variant="primary"
                className="ml-auto"
                loading={add.isPending && add.variables?.voiceId === v.voiceId}
                disabled={add.isPending || costOf(v, plan).kind === "blocked"}
                title={costOf(v, plan).kind === "blocked" ? t("voice.library.blockedTitle") : undefined}
                onClick={() => add.mutate(v)}
              >
                {t("voice.library.use")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {lib.hasNextPage ? (
        <Button size="sm" variant="ghost" loading={lib.isFetchingNextPage} onClick={() => lib.fetchNextPage()}>
          {t("voice.library.loadMore")}
        </Button>
      ) : null}
    </div>
  );
}

type VoiceCost = { kind: "free" | "paid" | "blocked" | "extra"; rate?: number };

/** How a library voice is billed for this account. `plan` is the ElevenLabs tier, or null if unknown. */
function costOf(v: LibraryVoice, plan: string | null): VoiceCost {
  // ElevenLabs' Free plan can't use any library voice through the API (402 paid_plan_required).
  if (plan === "free") return { kind: "blocked" };
  if (v.fiatRate) return { kind: "extra", rate: v.fiatRate };
  if (!v.freeUsersAllowed) return { kind: "paid" };
  return { kind: "free" };
}

function PriceBadge({ t, cost }: { t: T; cost: VoiceCost }) {
  if (cost.kind === "extra") return <Badge tone="amber">{t("voice.cost.extra", { rate: cost.rate!.toFixed(2) })}</Badge>;
  if (cost.kind === "blocked") return <Badge tone="red">{t("voice.cost.blocked")}</Badge>;
  if (cost.kind === "paid") return <Badge tone="blue">{t("voice.cost.paid")}</Badge>;
  return <Badge tone="green">{t("voice.cost.free")}</Badge>;
}
