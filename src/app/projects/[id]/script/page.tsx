"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileSearch, History, ListTree, MessageCircle, PenLine, RefreshCw, Scissors, Shrink, Sparkles, Wand2 } from "lucide-react";
import { HistoryPanel } from "@/components/history-panel";
import { AdScriptEditor } from "@/components/ad-script-editor";
import { api, autopilotRunning, useProject, useProjectAction, type ProjectData } from "@/lib/client";
import { estimateMinutes, longSentences, splitParagraphs, splitSentences, wordCount } from "@/lib/sync";
import { isDrama, lengthBudget, needsTrim, pacingOf, type ChannelProfile } from "@/lib/channel";
import { ALL_OUTLINE_TEMPLATES, chapterOfKey, isChapterTemplate } from "@/lib/outline-templates";
import { chapterHeader, splitChapters } from "@/lib/chapters";
import Link from "next/link";
import { templateOf } from "@/lib/ai/prompts";
import type { Outline } from "@/lib/types";

type ChapterProgress = { n: number; count: number; phase: "writing" | "polish" | "trim" };
const CHAPTER_MARKER = /\n?\[\[CHAPTER (\d+)\/(\d+)(?: (polish|trim))?\]\]\n?/g;
import { StaleBanner, StepFooter, StepHeader } from "@/components/step";
import { Badge, Button, Card, EmptyState, ErrorNote, Input, Select, Spinner, Tabs, Textarea, cn, useSyncedState } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function ScriptPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useProject(id);
  if (data?.channel.kind === "product_ad") return <AdScriptEditor data={data} />;
  return <LongScriptPage />;
}

function LongScriptPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useProject(id);
  const qc = useQueryClient();
  const act = useProjectAction<{ outline?: Outline; text?: string }>(id);
  const t = useT();

  const [draft, setDraft] = useState<string>("");
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [view, setView] = useState<"edit" | "paragraphs">("edit");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [phase, setPhase] = useState<"writing" | "polishing" | "shortening" | "trimming" | null>(null);
  const [chapterProgress, setChapterProgress] = useState<ChapterProgress | null>(null);
  // Progress while Claude works: which pass, when it started, and whether its first words arrived yet.
  const [progress, setProgress] = useState<{ step: number; total: number; since: number; gotText: boolean } | null>(null);
  const loaded = useRef(false);
  const lastServer = useRef("");
  const pilot = autopilotRunning(data);

  useEffect(() => {
    if (!data) return;
    const server = data.project.script ?? "";
    if (!loaded.current) {
      setDraft(server);
      loaded.current = true;
    } else if (!streaming && server !== lastServer.current) {
      // Written elsewhere (Autopilot, History restore): show it, unless you have unsaved edits of your own.
      setDraft((cur) => (cur === lastServer.current ? server : cur));
    }
    lastServer.current = server;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Autosave edits (debounced). Never while Autopilot may be writing the script.
  useEffect(() => {
    if (!data || streaming || pilot || !loaded.current || draft === (data.project.script ?? "")) return;
    const timer = setTimeout(() => act.mutate({ action: "saveScript", script: draft }), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, streaming, pilot]);

  const locale = data?.channel.profile.language ?? "en";
  const pace = data ? pacingOf(data.channel.profile) : null;
  const words = wordCount(draft, locale);
  const budget = data ? lengthBudget(data.channel.profile) : null;
  const minutes = estimateMinutes(words, budget?.wpm ?? pace?.wordsPerMinute);
  const long = useMemo(() => (pace ? longSentences(draft, locale, pace.maxWordsPerSentence) : []), [draft, locale, pace]);
  const profile = data?.channel.profile;

  /** Stream the script (or only the natural-speech pass) into the editor. */
  async function writeScript(mode: "write" | "continue" | "polish" | "shorten" | "trim" = "write") {
    setStreaming(true);
    setPhase(mode === "polish" ? "polishing" : mode === "shorten" ? "shortening" : mode === "trim" ? "trimming" : "writing");
    setStreamError(null);
    setChapterProgress(null);
    // A story continued from a missing chapter keeps the chapters already written above the new text.
    const before = mode === "continue" ? draft.trimEnd() : "";
    if (mode === "write") setDraft("");
    setView("edit");
    const polishOn = profile ? profile.polishPass ?? (profile.language ?? "en") !== "en" : false;
    let passesSeen = 0;
    setProgress({ step: 1, total: mode === "write" && polishOn ? 2 : 1, since: Date.now(), gotText: false });
    try {
      const res = await fetch(`/api/projects/${id}/script-stream${mode === "write" ? "" : `?mode=${mode}`}`, { method: "POST" });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let raw = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        raw += dec.decode(value, { stream: true });
        let text = raw;
        const err = text.indexOf("[[ERROR]]");
        if (err >= 0) {
          setStreamError(text.slice(err + 9).trim());
          text = text.slice(0, err).trimEnd();
        }
        // Stories: a marker before each chapter. Show progress and turn each marker into the chapter's header line.
        if (text.includes("[[CHAPTER ")) {
          const marks = [...text.matchAll(CHAPTER_MARKER)];
          const m = marks[marks.length - 1];
          if (m) setChapterProgress({ n: Number(m[1]), count: Number(m[2]), phase: (m[3] as "polish" | "trim" | undefined) ?? "writing" });
          text = text.replace(CHAPTER_MARKER, (_all, n: string, _c, ph?: string) =>
            ph ? "" : `\n\n${chapterHeader(Number(n), data?.project.outline?.chapters?.find((c) => c.n === Number(n))?.title ?? "", locale)}\n\n`,
          );
          text = [before, text.trim()].filter(Boolean).join("\n\n");
        }
        // Each follow-up pass (natural speech, then trim if too long) replaces the text as it streams in.
        const polish = text.lastIndexOf("[[POLISH]]");
        if (polish >= 0) {
          const passes = text.split("[[POLISH]]").length - 1;
          if (mode === "write") setPhase(passes >= 2 || !polishOn ? "trimming" : "polishing");
          if (passes !== passesSeen) {
            passesSeen = passes;
            // Rewrite modes send one marker up front; in "write" each marker starts a new pass (a trim adds one).
            const step = mode === "write" ? passes + 1 : 1;
            setProgress((p) => ({ step, total: Math.max(p?.total ?? 1, step), since: Date.now(), gotText: false }));
          }
          text = text.slice(polish + "[[POLISH]]".length).trimStart();
        }
        if (text) {
          setDraft(text);
          setProgress((p) => (p && !p.gotText ? { ...p, gotText: true } : p));
        }
      }
    } catch (e) {
      setStreamError(String(e));
    } finally {
      // Show exactly what was saved (e.g. if a polish pass was discarded).
      const fresh = await qc.fetchQuery({ queryKey: ["project", id], queryFn: () => api<ProjectData>(`/api/projects/${id}`) });
      setDraft(fresh.project.script ?? "");
      setStreaming(false);
      setPhase(null);
      setProgress(null);
      setChapterProgress(null);
    }
  }

  if (!data || !profile) return <Spinner />;
  const outline = data.project.outline;
  const isStory = data.story.isStory;
  const plannedChapters = outline ? [...new Set(outline.sections.map((s) => chapterOfKey(s.key)).filter((n): n is number => n != null))] : [];
  const writtenChapters = isStory ? splitChapters(draft).filter((c) => c.text.trim()) : [];
  const nextChapter = isStory && writtenChapters.length ? plannedChapters.find((n) => !writtenChapters.some((c) => c.n === n)) : undefined;
  const b = budget!;
  const tooLong = needsTrim(words, b);
  const wordTone = words < b.minWords * 0.9 || tooLong ? "amber" : "green";
  const fmtLen = (m: number) => (m < 2 ? t("script.seconds", { n: Math.round(m * 60) }) : t("script.minutes", { n: Math.round(m * 10) / 10 }));
  const voiced = data.project.audioDuration && data.project.script === draft ? data.project.audioDuration / 60 : null;

  return (
    <div>
      <StepHeader
        title={t("script.title")}
        models={[
          { label: t("script.modelOutline"), model: data.models.outline },
          { label: t("script.modelScript"), model: data.models.script },
          { label: t("script.modelFactCheck"), model: data.models.fact_check },
        ]}
        description={t("script.description")}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)} icon={<History className="size-3.5" />}>
              {t("script.history")}
            </Button>
            <a href={`/api/projects/${id}/export?type=script`}>
              <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} disabled={!draft}>
                .txt
              </Button>
            </a>
          </>
        }
      />
      <StaleBanner data={data} step="script">
        {t("script.stale")}
      </StaleBanner>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Main editor */}
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs<"edit" | "paragraphs">
              value={view}
              onChange={setView}
              items={[
                { value: "edit", label: t("script.tabEdit") },
                { value: "paragraphs", label: t("script.tabParagraphs") },
              ]}
            />
            {isStory ? (
              <Badge tone="neutral">{t("script.story.chapters", { count: writtenChapters.length, words })}</Badge>
            ) : (
              <Badge tone={words ? wordTone : "neutral"}>
                {t("script.wordsLen", { count: words, len: fmtLen(minutes) })}
                {words && tooLong ? t("script.overLimit", { max: fmtLen(b.maxMinutes) }) : ""}
              </Badge>
            )}
            {chapterProgress ? (
              <span className="text-xs font-medium text-brand-ink">
                {t(chapterProgress.phase === "polish" ? "script.story.polishingChapter" : chapterProgress.phase === "trim" ? "script.story.trimmingChapter" : "script.story.writingChapter", {
                  n: chapterProgress.n,
                  count: chapterProgress.count,
                })}
              </span>
            ) : null}
            <span className="text-xs text-stone-500" title={t(b.measured ? "script.wpmMeasured" : "script.wpmTitle", { wpm: b.wpm })}>
              {t("script.target", { min: fmtLen(b.minMinutes), max: fmtLen(b.maxMinutes), minWords: b.minWords, maxWords: b.maxWords })}
              {voiced ? t("script.voiced", { time: `${Math.floor(voiced)}:${String(Math.round((voiced % 1) * 60)).padStart(2, "0")}` }) : ""}
            </span>
            {draft && !streaming ? (
              long.length ? (
                <button onClick={() => setView("paragraphs")} title={t("script.showLong")}>
                  <Badge tone="amber">
                    {t(long.length === 1 ? "script.longOne" : "script.longMany", { count: long.length, max: pace?.maxWordsPerSentence ?? "" })}
                  </Badge>
                </button>
              ) : (
                <Badge tone="green">{t("script.shortOk")}</Badge>
              )
            ) : null}
            <div className="ml-auto flex gap-2">
              <Button
                variant={draft ? "secondary" : "primary"}
                onClick={() => writeScript("write")}
                loading={streaming && phase === "writing"}
                disabled={!outline || pilot}
                title={pilot ? t("script.autopilotRunning") : !outline ? t("script.outlineFirst") : undefined}
                icon={draft ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}
              >
                {streaming && phase === "writing" ? t("script.writing") : draft ? t("script.rewriteScript") : t("script.writeScript")}
              </Button>
              {nextChapter && !streaming ? (
                <Button variant="primary" onClick={() => writeScript("continue")} disabled={pilot} icon={<Sparkles className="size-4" />}>
                  {t("script.story.continue", { n: nextChapter, count: plannedChapters.length })}
                </Button>
              ) : null}
              {!isStory && draft && tooLong ? (
                <Button
                  variant="secondary"
                  onClick={() => writeScript("trim")}
                  loading={streaming && phase === "trimming"}
                  disabled={streaming || pilot}
                  title={t("script.trimTitle")}
                  icon={<Shrink className="size-4" />}
                >
                  {streaming && phase === "trimming" ? t("script.trimming") : t("script.trim")}
                </Button>
              ) : null}
              {!isStory && draft && long.length ? (
                <Button
                  variant="secondary"
                  onClick={() => writeScript("shorten")}
                  loading={streaming && phase === "shortening"}
                  disabled={streaming || pilot}
                  title={t("script.shortenTitle")}
                  icon={<Scissors className="size-4" />}
                >
                  {streaming && phase === "shortening" ? t("script.shortening") : t("script.shorten")}
                </Button>
              ) : null}
              {!isStory && draft ? (
                <Button
                  variant="secondary"
                  onClick={() => writeScript("polish")}
                  loading={streaming && phase === "polishing"}
                  disabled={streaming || pilot}
                  title={t("script.polishTitle")}
                  icon={<MessageCircle className="size-4" />}
                >
                  {streaming && phase === "polishing" ? t("script.polishing") : t("script.polish")}
                </Button>
              ) : null}
            </div>
          </div>
          {streamError ? <ErrorNote error={streamError} /> : null}
          {streaming && progress ? <ScriptProgress progress={progress} phase={phase} /> : null}

          {!draft && !streaming ? (
            <EmptyState icon={<PenLine className="size-8" />} title={t("script.empty")}>
              {outline ? t("script.emptyReady") : t("script.emptyStart")} {t("script.emptyBlank")}
            </EmptyState>
          ) : view === "edit" ? (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              readOnly={streaming || pilot}
              title={pilot ? t("script.editLocked") : undefined}
              className={cn(
                "min-h-[60vh] resize-y p-5 font-[Georgia,serif] text-[16px] leading-8",
                streaming && progress && !progress.gotText && "opacity-50",
              )}
              spellCheck
            />
          ) : (
            <ParagraphList id={id} script={draft} onChange={setDraft} locale={locale} maxWords={pace?.maxWordsPerSentence ?? 14} />
          )}
          {isStory && writtenChapters.length && !streaming ? <ChaptersPanel data={data} script={draft} /> : null}
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <OutlinePanel
            id={id}
            outline={outline ?? null}
            hook={data.project.hook}
            profile={profile}
            busy={(act.isPending && act.variables?.action === "outline") || pilot}
            onGenerate={(template, chapters) => act.mutate({ action: "outline", template, chapters })}
          />
          <FactCheckPanel id={id} hasScript={Boolean(data.project.script)} />
          {act.error ? <ErrorNote error={act.error} /> : null}
        </div>
      </div>

      {historyOpen ? (
        <HistoryPanel
          projectId={id}
          currentScript={draft}
          currentOutline={outline ?? null}
          locale={locale}
          onClose={() => setHistoryOpen(false)}
          onRestored={(kind, content) => {
            if (kind === "script") setDraft(content);
            qc.invalidateQueries({ queryKey: ["project", id] });
          }}
        />
      ) : null}

      <StepFooter
        data={data}
        step="script"
        canApprove={!isStory && Boolean(draft.trim()) && !streaming && !pilot}
        hint={
          isStory
            ? t("script.story.hint")
            : data.project.factChecks?.some((c) => c.confidence === "low" && !c.verified)
              ? t("script.hintLowConfidence")
              : t("script.hintApprove")
        }
      />
    </div>
  );
}

/** "Step 1 of 2 · Writing draft · 0:47", plus a note while Claude thinks before its first words. */
function ScriptProgress({
  progress,
  phase,
}: {
  progress: { step: number; total: number; since: number; gotText: boolean };
  phase: "writing" | "polishing" | "shortening" | "trimming" | null;
}) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const secs = Math.max(0, Math.floor((now - progress.since) / 1000));
  const label =
    phase === "polishing" ? t("script.progressPolish") : phase === "trimming" ? t("script.progressTrim") : phase === "shortening" ? t("script.progressShorten") : t("script.progressDraft");
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
      <Spinner />
      <span className="font-medium">
        {progress.total > 1 ? `${t("script.progressStep", { n: progress.step, total: progress.total })} · ` : ""}
        {label}
      </span>
      <span className="tabular-nums text-stone-500">
        {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
      </span>
      {!progress.gotText ? (
        <span className="w-full text-xs text-stone-500">{progress.step > 1 || phase !== "writing" ? t("script.progressReplacing") : t("script.progressThinking")}</span>
      ) : null}
    </div>
  );
}

function OutlinePanel({
  id,
  outline,
  hook,
  busy,
  onGenerate,
  profile,
}: {
  id: string;
  outline: Outline | null;
  hook: string | null;
  busy: boolean;
  profile: ChannelProfile;
  onGenerate: (template: string, chapters: number | "auto") => void;
}) {
  const act = useProjectAction(id);
  const t = useT();
  const [local, setLocal] = useSyncedState<Outline | null>(outline);
  const [chapters, setChapters] = useState<number | "auto">("auto");
  const channelTemplate = templateOf(profile);
  const templateNames = [channelTemplate.name, ...ALL_OUTLINE_TEMPLATES.map((x) => x.name).filter((n) => n !== channelTemplate.name)];
  const [template, setTemplate] = useState(channelTemplate.name);
  const chosen = template === channelTemplate.name ? channelTemplate : ALL_OUTLINE_TEMPLATES.find((x) => x.name === template) ?? channelTemplate;

  function edit(i: number, beats: string) {
    if (!local) return;
    const next = { ...local, sections: local.sections.map((s, j) => (j === i ? { ...s, beats: beats.split("\n").filter((b) => b.trim()) } : s)) };
    setLocal(next);
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <ListTree className="size-4 text-stone-500" /> {t("script.outline.title")}
        </div>
        <Button size="sm" variant={outline ? "ghost" : "primary"} loading={busy} onClick={() => onGenerate(template, chapters)} icon={<Sparkles className="size-3.5" />}>
          {outline ? t("script.outline.regenerate") : t("script.outline.create")}
        </Button>
      </div>
      <div className="mb-3">
        <Select aria-label={t("script.outline.structure")} className="h-8 text-[13px]" value={template} onChange={(e) => setTemplate(e.target.value)}>
          {templateNames.map((n) => (
            <option key={n} value={n}>
              {n === channelTemplate.name ? t("script.outline.channelDefault", { name: n }) : n}
            </option>
          ))}
        </Select>
      </div>
      {isDrama(profile) && isChapterTemplate(chosen) ? (
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-stone-600">{t("script.outline.chapters")}</span>
            <Select
              aria-label={t("script.outline.chapters")}
              className="h-8 flex-1 text-[13px]"
              value={String(chapters)}
              onChange={(e) => setChapters(e.target.value === "auto" ? "auto" : Number(e.target.value))}
            >
              <option value="auto">{t("script.outline.chaptersAuto")}</option>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          <p className="mt-1 text-[11px] text-stone-500">{t("script.outline.perChapter", { len: `${lengthBudget(profile).maxMinutes} min` })}</p>
        </div>
      ) : null}
      {!local ? (
        <p className="text-sm text-stone-600">
          {chosen.beats.map((b) => b.name).join(" → ")}
          {hook ? <span className="mt-2 block italic">{t("script.outline.openingIdea", { hook })}</span> : null}
        </p>
      ) : (
        <div className="space-y-3">
          {local.sections.map((s, i) => (
            <div key={s.key}>
              {chapterOfKey(s.key) != null && chapterOfKey(s.key) !== chapterOfKey(local.sections[i - 1]?.key ?? "") ? (
                <div className="mb-2 mt-4 border-t border-stone-200 pt-3 text-sm font-semibold text-stone-800 first:mt-0 first:border-0 first:pt-0">
                  {t("script.outline.chapterHeading", { n: chapterOfKey(s.key)! })}
                  {local.chapters?.find((c) => c.n === chapterOfKey(s.key))?.title ? ` · ${local.chapters.find((c) => c.n === chapterOfKey(s.key))!.title}` : ""}
                </div>
              ) : null}
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{s.title}</div>
              <Textarea
                rows={Math.max(2, s.beats.length)}
                className="text-[13px]"
                value={s.beats.join("\n")}
                onChange={(e) => edit(i, e.target.value)}
                onBlur={() => local && act.mutate({ action: "saveOutline", outline: local })}
              />
              {s.notes?.length ? (
                <ul className="mt-1 space-y-0.5 text-[11px] italic text-stone-500" aria-label={t("script.outline.notes")}>
                  {s.notes.map((n, j) => (
                    <li key={j}>{t("script.outline.note", { note: n })}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          {local.evidence.length ? (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{t("script.outline.evidence")}</div>
              <div className="flex flex-wrap gap-1">
                {local.evidence.map((e, i) => (
                  <Badge key={i}>{e}</Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function FactCheckPanel({ id, hasScript }: { id: string; hasScript: boolean }) {
  const { data } = useProject(id);
  const act = useProjectAction(id);
  const t = useT();
  const checks = data?.project.factChecks ?? null;
  const tone = { high: "green", medium: "amber", low: "red" } as const;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <FileSearch className="size-4 text-stone-500" /> {t("script.fact.title")}
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={!hasScript}
          loading={act.isPending && act.variables?.action === "factCheck"}
          onClick={() => act.mutate({ action: "factCheck" })}
        >
          {checks ? t("script.fact.rerun") : t("script.fact.run")}
        </Button>
      </div>
      {!checks ? (
        <p className="text-sm text-stone-600">{t("script.fact.intro")}</p>
      ) : !checks.length ? (
        <p className="text-sm text-stone-600">{t("script.fact.none")}</p>
      ) : (
        <ul className="space-y-2">
          {checks.map((c, i) => (
            <li key={i} className={cn("rounded-lg p-2.5 ring-1", c.verified ? "bg-emerald-50/50 ring-emerald-200" : "bg-stone-50 ring-stone-200")}>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 accent-emerald-600"
                  checked={Boolean(c.verified)}
                  onChange={(e) => act.mutate({ action: "verifyFact", index: i, verified: e.target.checked })}
                />
                <div className="min-w-0 text-[13px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{c.name}</span>
                    <Badge tone={tone[c.confidence]}>{t.dyn(`script.fact.${c.confidence}`, c.confidence)}</Badge>
                  </div>
                  <div className="mt-0.5 text-stone-700">{c.claim}</div>
                  <div className="mt-0.5 text-stone-500">{c.note}</div>
                </div>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ParagraphList({
  id,
  script,
  onChange,
  locale,
  maxWords,
}: {
  id: string;
  script: string;
  onChange: (s: string) => void;
  locale: string;
  maxWords: number;
}) {
  const paragraphs = useMemo(() => splitParagraphs(script), [script]);
  const act = useProjectAction<{ text: string }>(id);
  const t = useT();
  const [instr, setInstr] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  async function rewrite(i: number) {
    setBusy(i);
    try {
      const res = await act.mutateAsync({ action: "rewriteParagraph", paragraph: paragraphs[i], instruction: instr[i] ?? "" });
      const next = [...paragraphs];
      next[i] = res.text.trim();
      const script = next.join("\n\n");
      // Saved as its own "Rewrite" version, labelled with the instruction.
      await act.mutateAsync({ action: "saveScript", script, source: "rewrite", note: `¶${i + 1}: ${instr[i] || "rewrite"}` });
      onChange(script);
      setInstr({ ...instr, [i]: "" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {act.error ? <ErrorNote error={act.error} /> : null}
      {paragraphs.map((p, i) => (
        <Card key={i} className="p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-stone-500">
            <span>
              {t("script.para.heading", { n: i + 1, count: wordCount(p, locale) })}
            </span>
          </div>
          <p className="font-[Georgia,serif] text-[15px] leading-7 text-stone-800">
            {splitSentences(p, locale).map((s, j) => {
              const w = wordCount(s.text, locale);
              return (
                <span
                  key={j}
                  className={cn(w > maxWords && "rounded bg-amber-100 underline decoration-amber-400 decoration-2")}
                  title={w > maxWords ? t("script.para.wordsLimit", { count: w, max: maxWords }) : undefined}
                >
                  {s.text}{" "}
                </span>
              );
            })}
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              className="h-8 text-[13px]"
              placeholder={t("script.para.instruction")}
              value={instr[i] ?? ""}
              onChange={(e) => setInstr({ ...instr, [i]: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && rewrite(i)}
            />
            <Button size="sm" loading={busy === i} disabled={busy !== null && busy !== i} onClick={() => rewrite(i)} icon={<Wand2 className="size-3.5" />}>
              {t("script.para.rewrite")}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Story projects: pick chapters and turn each one into its own video project. */
function ChaptersPanel({ data, script }: { data: ProjectData; script: string }) {
  const t = useT();
  const act = useProjectAction<{ created: string[]; updated: string[]; skipped: { chapter: number; reason: string }[] }>(data.project.id);
  const chapters = splitChapters(script);
  const videos = new Map(data.story.chapterVideos.map((v) => [v.chapter, v]));
  const [picked, setPicked] = useState<number[]>([]);
  const locale = data.channel.profile.language ?? "en";
  const wpm = lengthBudget(data.channel.profile).wpm;
  const toggle = (n: number) => setPicked((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));

  function create() {
    const approved = picked.filter((n) => videos.get(n)?.scriptApproved);
    const force = approved.length ? confirm(t("script.story.updateApprovedConfirm", { list: approved.join(", ") })) : false;
    act.mutate({ action: "chapterVideos", chapters: picked, force }, { onSuccess: () => setPicked([]) });
  }

  return (
    <Card className="p-4">
      <div className="mb-1 font-medium">{t("script.story.panelTitle")}</div>
      <p className="mb-3 text-xs text-stone-500">{t("script.story.panelHelp")}</p>
      <ul className="divide-y divide-stone-100">
        {chapters.map((c) => {
          const v = videos.get(c.n);
          const w = wordCount(c.text, locale);
          return (
            <li key={c.n} className="flex flex-wrap items-center gap-3 py-2">
              <input type="checkbox" className="size-4 accent-orange-500" checked={picked.includes(c.n)} onChange={() => toggle(c.n)} disabled={!c.text.trim()} aria-label={chapterHeader(c.n, c.title, locale)} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{chapterHeader(c.n, c.title, locale).replace(/^##\s*/, "")}</div>
                <div className="text-xs text-stone-500">
                  {w ? t("script.wordsLen", { count: w, len: `${Math.round(estimateMinutes(w, wpm) * 10) / 10} min` }) : t("script.story.empty")}
                </div>
              </div>
              {v ? (
                <>
                  <Badge tone={v.differs ? "amber" : v.scriptApproved ? "green" : "neutral"}>
                    {v.differs ? t("script.story.statusDiffers") : v.scriptApproved ? t("script.story.statusApproved") : t("script.story.statusCreated")}
                  </Badge>
                  <Link href={`/projects/${v.id}/script`} className="text-xs font-medium text-brand-ink hover:underline">
                    {t("script.story.open")}
                  </Link>
                </>
              ) : (
                <Badge tone="neutral">{t("script.story.statusNone")}</Badge>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => setPicked(chapters.filter((c) => c.text.trim()).map((c) => c.n))}>
          {t("script.story.selectAll")}
        </Button>
        <Button size="sm" onClick={create} disabled={!picked.length} loading={act.isPending}>
          {t("script.story.create", { count: picked.length })}
        </Button>
        {act.data ? <span className="text-xs text-stone-500">{t("script.story.result", { created: act.data.created.length, updated: act.data.updated.length })}</span> : null}
      </div>
      {act.error ? <ErrorNote error={act.error} /> : null}
    </Card>
  );
}
