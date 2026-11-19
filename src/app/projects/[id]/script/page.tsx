"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileSearch, History, ListTree, MessageCircle, PenLine, RefreshCw, Scissors, Shrink, Sparkles, Wand2 } from "lucide-react";
import { HistoryPanel } from "@/components/history-panel";
import { AdScriptEditor } from "@/components/ad-script-editor";
import { api, autopilotRunning, useProject, useProjectAction, type ProjectData } from "@/lib/client";
import { estimateMinutes, longSentences, splitParagraphs, splitSentences, wordCount } from "@/lib/sync";
import { lengthBudget, needsTrim, pacingOf, type ChannelProfile } from "@/lib/channel";
import { OUTLINE_TEMPLATES } from "@/lib/outline-templates";
import { templateOf } from "@/lib/ai/prompts";
import type { Outline } from "@/lib/types";
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
  async function writeScript(mode: "write" | "polish" | "shorten" | "trim" = "write") {
    setStreaming(true);
    setPhase(mode === "polish" ? "polishing" : mode === "shorten" ? "shortening" : mode === "trim" ? "trimming" : "writing");
    setStreamError(null);
    if (mode === "write") setDraft("");
    setView("edit");
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
        // Each follow-up pass (natural speech, then trim if too long) replaces the text as it streams in.
        const polish = text.lastIndexOf("[[POLISH]]");
        if (polish >= 0) {
          if (mode === "write") {
            const passes = text.split("[[POLISH]]").length - 1;
            const polishOn = profile ? profile.polishPass ?? (profile.language ?? "en") !== "en" : false;
            setPhase(passes >= 2 || !polishOn ? "trimming" : "polishing");
          }
          text = text.slice(polish + "[[POLISH]]".length).trimStart();
        }
        if (text) setDraft(text);
      }
    } catch (e) {
      setStreamError(String(e));
    } finally {
      // Show exactly what was saved (e.g. if a polish pass was discarded).
      const fresh = await qc.fetchQuery({ queryKey: ["project", id], queryFn: () => api<ProjectData>(`/api/projects/${id}`) });
      setDraft(fresh.project.script ?? "");
      setStreaming(false);
      setPhase(null);
    }
  }

  if (!data || !profile) return <Spinner />;
  const outline = data.project.outline;
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
            <Badge tone={words ? wordTone : "neutral"}>
              {t("script.wordsLen", { count: words, len: fmtLen(minutes) })}
              {words && tooLong ? t("script.overLimit", { max: fmtLen(b.maxMinutes) }) : ""}
            </Badge>
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
              {draft && tooLong ? (
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
              {draft && long.length ? (
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
              {draft ? (
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
              className="min-h-[60vh] resize-y p-5 font-[Georgia,serif] text-[16px] leading-8"
              spellCheck
            />
          ) : (
            <ParagraphList id={id} script={draft} onChange={setDraft} locale={locale} maxWords={pace?.maxWordsPerSentence ?? 14} />
          )}
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <OutlinePanel
            id={id}
            outline={outline ?? null}
            hook={data.project.hook}
            profile={profile}
            busy={(act.isPending && act.variables?.action === "outline") || pilot}
            onGenerate={(template) => act.mutate({ action: "outline", template })}
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
        canApprove={Boolean(draft.trim()) && !streaming && !pilot}
        hint={
          data.project.factChecks?.some((c) => c.confidence === "low" && !c.verified)
            ? t("script.hintLowConfidence")
            : t("script.hintApprove")
        }
      />
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
  onGenerate: (template: string) => void;
}) {
  const act = useProjectAction(id);
  const t = useT();
  const [local, setLocal] = useSyncedState<Outline | null>(outline);
  const channelTemplate = templateOf(profile);
  const templateNames = [channelTemplate.name, ...OUTLINE_TEMPLATES.map((x) => x.name).filter((n) => n !== channelTemplate.name)];
  const [template, setTemplate] = useState(channelTemplate.name);
  const chosen = template === channelTemplate.name ? channelTemplate : OUTLINE_TEMPLATES.find((x) => x.name === template) ?? channelTemplate;

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
        <Button size="sm" variant={outline ? "ghost" : "primary"} loading={busy} onClick={() => onGenerate(template)} icon={<Sparkles className="size-3.5" />}>
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
      {!local ? (
        <p className="text-sm text-stone-600">
          {chosen.beats.map((b) => b.name).join(" → ")}
          {hook ? <span className="mt-2 block italic">{t("script.outline.openingIdea", { hook })}</span> : null}
        </p>
      ) : (
        <div className="space-y-3">
          {local.sections.map((s, i) => (
            <div key={s.key}>
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
