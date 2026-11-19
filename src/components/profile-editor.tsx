"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight, Sparkles } from "lucide-react";
import { api } from "@/lib/client";
import { genreOf, lengthBudget, onScreenFont, pacingOf, polishEnabled, storyFormatOf, textColors, type ChannelGenre, type ChannelProfile, type StoryFormat } from "@/lib/channel";
import { defaultTemplateFor } from "@/lib/outline-templates";
import { handFont } from "@/remotion/shared";
import { OutlineTemplateEditor } from "./outline-template-editor";
import { RowListEditor } from "./list-editor";
import { AutopilotSettings } from "./autopilot-settings";
import type { ProfileSection } from "@/lib/ai/prompts/channel";
import { FONT_OPTIONS, LANGUAGES, fontSupports, getLanguage, type FontKey } from "@/lib/languages";
import { contrastRatio, readableOn } from "@/lib/color";
import { Button, Card, ErrorNote, Input, Label, Select, Textarea } from "./ui";
import { useT } from "@/lib/i18n";

type Props = { value: ChannelProfile; onChange: (p: ChannelProfile) => void };

const lines = (xs: string[]) => xs.join("\n");
const unlines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

/** Essentials, structure, Autopilot and angles up front; everything else in collapsed "Advanced" sections. */
export function ProfileEditor({ value: p, onChange }: Props) {
  const t = useT();
  const pace = pacingOf(p);
  const len = lengthBudget(p);
  const set = <K extends keyof ChannelProfile>(k: K, v: ChannelProfile[K]) => onChange({ ...p, [k]: v });
  const setV = <K extends keyof ChannelProfile["visual"]>(k: K, v: ChannelProfile["visual"][K]) => onChange({ ...p, visual: { ...p.visual, [k]: v } });

  // Links like /channel#angles arrive before the profile has loaded; scroll once the section exists.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);

  const field = (label: string, value: string, change: (v: string) => void, rows = 2, hint?: string) => (
    <div>
      <Label hint={hint}>{label}</Label>
      <Textarea rows={rows} value={value} onChange={(e) => change(e.target.value)} className="text-[13px]" />
    </div>
  );

  return (
    <div className="space-y-4">
      {p.legacy && Object.keys(p.legacy).length ? <LegacyNote profile={p} onChange={onChange} /> : null}

      <Section
        title={t("channel.profile.essentials.title")}
        subtitle={t("channel.profile.essentials.subtitle")}
        section="essentials"
        profile={p}
        onChange={onChange}
        placeholder={t("channel.profile.essentials.placeholder")}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <Label>{t("channel.profile.essentials.channelName")}</Label>
            <Input value={p.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label hint={t("channel.profile.essentials.minutes")}>{t(genreOf(p) === "drama" && storyFormatOf(p) === "episodes" ? "channel.profile.essentials.videoLengthDrama" : "channel.profile.essentials.videoLength")}</Label>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                step={0.25}
                min={0.25}
                className="w-20"
                value={len.minMinutes}
                onChange={(e) => set("lengthMinutes", { min: Number(e.target.value), max: len.maxMinutes })}
                aria-label={t("channel.profile.essentials.minMinutes")}
              />
              <span className="text-stone-400">–</span>
              <Input
                type="number"
                step={0.25}
                min={0.25}
                className="w-20"
                value={len.maxMinutes}
                onChange={(e) => set("lengthMinutes", { min: len.minMinutes, max: Number(e.target.value) })}
                aria-label={t("channel.profile.essentials.maxMinutes")}
              />
            </div>
            <div className="mt-1 text-[11px] text-stone-500">
              {t(len.measured ? "channel.profile.essentials.wordsAimMeasured" : "channel.profile.essentials.wordsAim", {
                min: len.minWords,
                max: len.maxWords,
                wpm: len.wpm,
              })}
            </div>
          </div>
        </div>
        <div>
          <Label hint={t("channel.profile.essentials.languageHint")}>{t("channel.language")}</Label>
          <Select value={getLanguage(p.language).code} onChange={(e) => set("language", e.target.value)} className="max-w-xs">
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native}
                {l.native !== l.name ? ` (${l.name})` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label hint={t("channel.profile.essentials.genreHint")}>{t("channel.profile.essentials.genre")}</Label>
          <Select
            value={genreOf(p)}
            onChange={(e) => {
              const genre = e.target.value as ChannelGenre;
              const template = defaultTemplateFor(genre);
              const next: ChannelProfile = { ...p, genre };
              if (p.outlineTemplate?.name !== template.name && confirm(t("channel.profile.essentials.genreSwitchConfirm", { name: template.name }))) {
                next.outlineTemplate = structuredClone(template);
              }
              // Dialogue-heavy drama needs longer sentences than the explainer default.
              if (genre === "drama" && pacingOf(p).maxWordsPerSentence < 22) next.pacing = { ...pacingOf(p), maxWordsPerSentence: 25 };
              onChange(next);
            }}
            className="max-w-xs"
          >
            <option value="explainer">{t("channel.profile.essentials.genreExplainer")}</option>
            <option value="drama">{t("channel.profile.essentials.genreDrama")}</option>
          </Select>
        </div>
        {genreOf(p) === "drama" ? (
          <div>
            <Label hint={t("channel.profile.essentials.storyFormatHint")}>{t("channel.profile.essentials.storyFormat")}</Label>
            <Select value={storyFormatOf(p)} onChange={(e) => set("storyFormat", e.target.value as StoryFormat)} className="max-w-xs">
              <option value="episodes">{t("channel.profile.essentials.storyFormatEpisodes")}</option>
              <option value="single">{t("channel.profile.essentials.storyFormatSingle")}</option>
            </Select>
          </div>
        ) : null}
        {field(t("channel.profile.essentials.niche"), p.niche, (v) => set("niche", v), 3)}
        {field(t("channel.profile.essentials.narrationVoice"), p.voice, (v) => set("voice", v))}
        {field(
          t("channel.profile.essentials.voiceSample"),
          p.voiceSample ?? "",
          (v) => set("voiceSample", v),
          4,
          t("channel.profile.essentials.voiceSampleHint"),
        )}
        {field(t("channel.profile.essentials.artStyle"), p.visual.styleAnchor, (v) => setV("styleAnchor", v), 2, t("channel.profile.essentials.artStyleHint"))}
        <FontField profile={p} onChange={(v) => setV("font", v)} />
        {field(t("channel.profile.essentials.mainCharacter"), p.visual.mainCharacter, (v) => setV("mainCharacter", v), 3, t("channel.profile.essentials.mainCharacterHint"))}
      </Section>

      <Section
        title={t("channel.profile.structure.title")}
        subtitle={t("channel.profile.structure.subtitle")}
        section="outline"
        profile={p}
        onChange={onChange}
        placeholder={t("channel.profile.structure.placeholder")}
      >
        <OutlineTemplateEditor profile={p} onChange={onChange} />
      </Section>

      <Section
        id="autopilot"
        title={t("channel.profile.autopilot.title")}
        subtitle={t("channel.profile.autopilot.subtitle")}
        profile={p}
        onChange={onChange}
      >
        <AutopilotSettings profile={p} onChange={onChange} />
      </Section>

      <Section
        id="angles"
        title={t("channel.profile.angles.title")}
        subtitle={t("channel.profile.angles.subtitle")}
        section="angles"
        profile={p}
        onChange={onChange}
        placeholder={t("channel.profile.angles.placeholder")}
      >
        <RowListEditor
          value={p.topicAngles}
          onChange={(v) => set("topicAngles", v.map((a) => ({ ...a, name: a.template })))}
          columns={[
            { key: "template", label: t("channel.profile.angles.formula"), placeholder: t("channel.profile.angles.formulaPlaceholder") },
            { key: "description", label: t("channel.profile.angles.whenWorks"), placeholder: t("channel.profile.angles.whenWorksPlaceholder"), width: 1.3 },
          ]}
          newRow={() => ({ id: Math.max(0, ...p.topicAngles.map((a) => a.id)) + 1, name: "", template: "", description: "" })}
          addLabel={t("channel.profile.angles.add")}
        />
      </Section>

      <Advanced title={t("channel.profile.pacing.title")} hint={t("channel.profile.pacing.hint")} profile={p} onChange={onChange}>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label={t("channel.profile.pacing.maxWords")}
            hint={t("channel.profile.pacing.maxWordsHint")}
            value={pace.maxWordsPerSentence}
            min={5}
            max={40}
            onChange={(v) => set("pacing", { ...pace, maxWordsPerSentence: v })}
          />
          <NumberField
            label={t("channel.profile.pacing.speed")}
            hint={
              pace.measuredWpm
                ? t("channel.profile.pacing.speedHintMeasured", { wpm: pace.measuredWpm })
                : t("channel.profile.pacing.speedHint")
            }
            value={pace.wordsPerMinute}
            min={90}
            max={260}
            onChange={(v) => set("pacing", { ...pace, wordsPerMinute: v })}
          />
          <NumberField
            label={t("channel.profile.pacing.sentencesPerImage")}
            hint={t("channel.profile.pacing.sentencesPerImageHint")}
            value={pace.sentencesPerImage}
            min={1}
            max={4}
            onChange={(v) => set("pacing", { ...pace, sentencesPerImage: v })}
          />
          <label className="flex items-start gap-2 pt-6 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-orange-500"
              checked={pace.cameraCuts}
              onChange={(e) => set("pacing", { ...pace, cameraCuts: e.target.checked })}
            />
            <span>
              {t("channel.profile.pacing.cameraCuts")}
              <span className="block text-xs text-stone-500">{t("channel.profile.pacing.cameraCutsHelp")}</span>
            </span>
          </label>
          <label className="flex items-start gap-2 pt-6 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-orange-500"
              checked={pace.textFrames !== false}
              onChange={(e) => set("pacing", { ...pace, textFrames: e.target.checked })}
            />
            <span>
              {t("channel.profile.pacing.textFrames")}
              <span className="block text-xs text-stone-500">{t("channel.profile.pacing.textFramesHelp")}</span>
            </span>
          </label>
        </div>
      </Advanced>

      <Advanced title={t("channel.profile.writing.title")} hint={t("channel.profile.writing.hint")} section="story" profile={p} onChange={onChange}>
        {field(t("channel.profile.writing.format"), p.format, (v) => set("format", v), 1, t("channel.profile.writing.formatHint"))}
        {field(t("channel.profile.writing.evidence"), p.evidenceRule, (v) => set("evidenceRule", v), 3)}
        {field(t("channel.profile.writing.otherRules"), lines(p.extraScriptRules), (v) => set("extraScriptRules", unlines(v)), 5, t("channel.profile.writing.otherRulesHint"))}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-orange-500"
            checked={polishEnabled(p)}
            onChange={(e) => set("polishPass", e.target.checked)}
          />
          <span>
            {t("channel.profile.writing.polish")}
            <span className="block text-xs text-stone-500">{t("channel.profile.writing.polishHelp")}</span>
          </span>
        </label>
      </Advanced>

      <Advanced title={t("channel.profile.visual.title")} hint={t("channel.profile.visual.hint")} section="visual" profile={p} onChange={onChange}>
        {field(t("channel.profile.visual.avoid"), p.visual.styleLock, (v) => setV("styleLock", v), 3, t("channel.profile.visual.avoidHint"))}
        {field(t("channel.profile.visual.variants"), lines(p.visual.characterVariants), (v) => setV("characterVariants", unlines(v)), 3, t("channel.profile.onePerLine"))}
        {field(t("channel.profile.visual.devices"), lines(p.visual.conceptDevices), (v) => setV("conceptDevices", unlines(v)), 5, t("channel.profile.onePerLine"))}
        <div>
          <Label>{t("channel.profile.visual.colors")}</Label>
          <div className="mb-3 flex flex-wrap gap-4">
            <ColorInput label={t("channel.profile.visual.onScreenText")} value={p.visual.textColor ?? "#E0302B"} onChange={(v) => setV("textColor", v)} />
            <ColorInput label={t("channel.profile.visual.paper")} value={p.visual.paperColor ?? "#F5F1E6"} onChange={(v) => setV("paperColor", v)} />
          </div>
          <CaptionColorField
            value={p.visual.captionColor}
            paper={p.visual.paperColor ?? "#F5F1E6"}
            onChange={(v) => setV("captionColor", v)}
          />
          <div className="grid gap-2 sm:grid-cols-3">
            {p.visual.palette.map((c, i) => (
              <ColorInput
                key={i}
                label={c.name}
                value={c.hex}
                onChange={(hex) => setV("palette", p.visual.palette.map((x, j) => (j === i ? { ...x, hex } : x)))}
              />
            ))}
          </div>
        </div>
        <div>
          <Label hint={t("channel.profile.visual.backgroundsHint")}>{t("channel.profile.visual.backgrounds")}</Label>
          <RowListEditor
            value={p.visual.backgrounds}
            onChange={(v) => setV("backgrounds", v)}
            columns={[
              { key: "key", label: t("channel.profile.visual.key"), placeholder: "night", mono: true, width: 0.7, locked: (b) => b.key === "neutral" },
              { key: "label", label: t("channel.profile.visual.label"), placeholder: t("channel.profile.visual.bgLabelPlaceholder"), width: 0.8 },
              { key: "description", label: t("channel.profile.visual.looksLike"), placeholder: t("channel.profile.visual.bgLooksPlaceholder"), width: 1.6 },
              { key: "mood", label: t("channel.profile.visual.mood"), placeholder: t("channel.profile.visual.bgMoodPlaceholder"), width: 0.9 },
            ]}
            canRemove={(b) => b.key !== "neutral"}
            newRow={() => ({ key: "", label: "", description: "", mood: "" })}
            addLabel={t("channel.profile.visual.addBackground")}
          />
        </div>
        <div>
          <Label hint={t("channel.profile.visual.frameTypesHint")}>{t("channel.profile.visual.frameTypes")}</Label>
          <RowListEditor
            value={p.visual.frameTypes}
            onChange={(v) => setV("frameTypes", v)}
            columns={[
              { key: "key", label: t("channel.profile.visual.key"), placeholder: "close_up", mono: true, width: 0.7, locked: (f) => f.key === "concept_text" },
              { key: "label", label: t("channel.profile.visual.label"), placeholder: t("channel.profile.visual.frameLabelPlaceholder"), width: 0.8 },
              { key: "description", label: t("channel.profile.visual.whatItShows"), placeholder: t("channel.profile.visual.frameShowsPlaceholder"), width: 2 },
            ]}
            canRemove={(f) => f.key !== "concept_text"}
            newRow={() => ({ key: "", label: "", description: "" })}
            addLabel={t("channel.profile.visual.addFrameType")}
          />
        </div>
      </Advanced>

      <Advanced title={t("channel.profile.metadata.title")} hint={t("channel.profile.metadata.hint")} section="metadata" profile={p} onChange={onChange}>
        {field(t("channel.profile.metadata.rules"), p.metadataRules, (v) => set("metadataRules", v), 4)}
      </Advanced>
    </div>
  );
}

/** Read-only copy of fields that older settings had, so nothing silently disappears after the merge. */
function LegacyNote({ profile, onChange }: { profile: ChannelProfile; onChange: (p: ChannelProfile) => void }) {
  const t = useT();
  const entries = Object.entries(profile.legacy ?? {}).filter(([, v]) => v);
  return (
    <details className="rounded-xl bg-amber-50 px-5 py-3 text-[13px] ring-1 ring-amber-200">
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-amber-900">{t("channel.profile.legacy.title")}</span>
        <span className="text-amber-800">{t("channel.profile.legacy.see")}</span>
        <button
          type="button"
          className="ml-auto text-xs text-amber-800 underline-offset-2 hover:underline"
          onClick={(e) => {
            e.preventDefault();
            onChange({ ...profile, legacy: undefined });
          }}
        >
          {t("channel.profile.legacy.dismiss")}
        </button>
      </summary>
      <dl className="mt-3 space-y-2">
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-medium text-amber-900">{t.dyn(`channel.profile.legacy.labels.${k}`, k)}</dt>
            <dd className="whitespace-pre-wrap text-stone-700">{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// ---------- Sections with "Rewrite with AI" ----------

function useRewrite(profile: ChannelProfile, section: ProfileSection, onChange: (p: ChannelProfile) => void) {
  return useMutation({
    mutationFn: (instruction: string) =>
      api<{ profile: ChannelProfile }>("/api/channels", { json: { action: "rewrite", profile, section, instruction } }),
    onSuccess: (r) => onChange(r.profile),
  });
}

function RewriteBar({ section, profile, onChange, placeholder }: { section: ProfileSection; profile: ChannelProfile; onChange: (p: ChannelProfile) => void; placeholder?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const rewrite = useRewrite(profile, section, onChange);
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} icon={<Sparkles className="size-3.5" />}>
        {t("channel.profile.rewrite.button")}
      </Button>
    );
  }
  return (
    <form
      className="flex w-full flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) rewrite.mutate(text, { onSuccess: () => (setOpen(false), setText("")) });
      }}
    >
      <Input autoFocus className="h-8 min-w-[240px] flex-1 text-[13px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder ?? t("channel.profile.rewrite.placeholder")} />
      <Button size="sm" variant="primary" type="submit" loading={rewrite.isPending} disabled={!text.trim()}>
        {t("channel.profile.rewrite.submit")}
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
        {t("common.cancel")}
      </Button>
      {rewrite.error ? (
        <div className="w-full">
          <ErrorNote error={rewrite.error} />
        </div>
      ) : null}
    </form>
  );
}

function Section({
  id,
  title,
  subtitle,
  section,
  profile,
  onChange,
  placeholder,
  children,
}: {
  id?: string;
  title: string;
  subtitle: string;
  /** Section the "Rewrite with AI" bar rewrites; none = no bar. */
  section?: ProfileSection;
  profile: ChannelProfile;
  onChange: (p: ChannelProfile) => void;
  placeholder?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="scroll-mt-4 p-5" id={id}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-[13px] text-stone-600">{subtitle}</p>
        </div>
        {section ? <RewriteBar section={section} profile={profile} onChange={onChange} placeholder={placeholder} /> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function Advanced({
  title,
  hint,
  section,
  profile,
  onChange,
  children,
}: {
  title: string;
  hint: string;
  section?: ProfileSection;
  profile: ChannelProfile;
  onChange: (p: ChannelProfile) => void;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <details className="group rounded-xl bg-white ring-1 ring-stone-200">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-stone-500 transition-transform group-open:rotate-90" />
        <span className="font-semibold">{title}</span>
        <span className="text-[13px] text-stone-500">· {hint}</span>
        <span className="ml-auto text-[11px] font-medium uppercase tracking-wide text-stone-400">{t("channel.profile.advanced")}</span>
      </summary>
      <div className="space-y-4 border-t border-stone-200 px-5 py-4">
        {section ? (
          <div className="flex justify-end">
            <RewriteBar section={section} profile={profile} onChange={onChange} />
          </div>
        ) : null}
        {children}
      </div>
    </details>
  );
}

// ---------- Field widgets ----------

const FONT_GROUPS = ["Hand-drawn", "Bold / clean", "Cinematic / serif"] as const;
const LANGUAGE_FONT_LABELS: Partial<Record<FontKey, string>> = {
  pangolin: "Pangolin",
  itim: "Itim",
  kalam: "Kalam",
  yusei: "Yusei Magic",
  zcool: "ZCOOL KuaiLe",
  gamja: "Gamja Flower",
};

/** Font for text the app draws over images, text frames and Short titles, with a live sample. */
function FontField({ profile, onChange }: { profile: ChannelProfile; onChange: (v: FontKey | undefined) => void }) {
  const t = useT();
  const lang = getLanguage(profile.language);
  const chosen = profile.visual.font;
  const used = onScreenFont(profile);
  const colors = textColors(profile);
  const autoLabel = FONT_OPTIONS.find((f) => f.key === lang.font)?.label ?? LANGUAGE_FONT_LABELS[lang.font] ?? t("channel.profile.font.handDrawn");
  return (
    <div>
      <Label hint={t("channel.profile.font.hint")}>{t("channel.profile.font.label")}</Label>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={chosen ?? ""} onChange={(e) => onChange((e.target.value || undefined) as FontKey | undefined)} className="max-w-xs">
          <option value="">{t("channel.profile.font.auto", { font: autoLabel, language: lang.name })}</option>
          {FONT_GROUPS.map((g) => (
            <optgroup key={g} label={t.dyn(`channel.profile.fontGroups.${g}`, g)}>
              {FONT_OPTIONS.filter((f) => f.group === g).map((f) => {
                const ok = fontSupports(f.key, lang.code);
                return (
                  <option key={f.key} value={f.key} disabled={!ok}>
                    {ok ? f.label : t("channel.profile.font.unsupported", { font: f.label, language: lang.name })}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </Select>
        <span
          className="rounded-lg px-4 py-2 text-2xl leading-tight ring-1 ring-stone-200"
          style={{ background: colors.paper, color: colors.text, fontFamily: handFont(used) }}
          title={t("channel.profile.font.sampleTitle")}
        >
          {lang.code === "vi" ? "300.000 NĂM TRƯỚC" : "300,000 YEARS AGO"}
        </span>
      </div>
      {chosen && chosen !== used ? (
        <p className="mt-1 text-[11px] text-amber-700">{t("channel.profile.font.cantShow", { language: lang.name })}</p>
      ) : null}
    </div>
  );
}

/** Shorts captions on the paper: auto (white or dark, whichever reads) or a fixed color, with a contrast warning. */
function CaptionColorField({ value, paper, onChange }: { value?: string; paper: string; onChange: (v: string | undefined) => void }) {
  const t = useT();
  const auto = readableOn(paper);
  const low = value ? contrastRatio(value, paper) < 3 : false;
  return (
    <div className="mb-3 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200">
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-[13px] font-medium">{t("channel.profile.caption.title")}</span>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" className="size-4 accent-orange-500" checked={!value} onChange={(e) => onChange(e.target.checked ? undefined : auto)} />
          {t("channel.profile.caption.auto")}
        </label>
        {value ? (
          <div className="w-48">
            <ColorInput label={t("channel.profile.caption.color")} value={value} onChange={onChange} />
          </div>
        ) : null}
        <span
          className="rounded px-2.5 py-1 text-[13px] font-extrabold"
          style={{ background: paper, color: value ?? auto }}
          title={t("channel.profile.caption.sampleTitle")}
        >
          {t("channel.profile.caption.sample")}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-stone-500">
        {t("channel.profile.caption.help")}
      </p>
      {low ? <p className="mt-1 text-[11px] text-amber-700">{t("channel.profile.caption.low")}</p> : null}
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="size-8 shrink-0 cursor-pointer rounded border-0 bg-transparent" />
      <span className="truncate">{label}</span>
      <span className="ml-auto font-mono text-[11px] text-stone-500">{value}</span>
    </label>
  );
}

function NumberField({ label, hint, value, min, max, onChange }: { label: string; hint?: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      <Input type="number" className="w-28" value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
