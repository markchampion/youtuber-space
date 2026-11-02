"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight, Sparkles } from "lucide-react";
import { api } from "@/lib/client";
import { lengthBudget, onScreenFont, pacingOf, polishEnabled, textColors, type ChannelProfile } from "@/lib/channel";
import { handFont } from "@/remotion/shared";
import { OutlineTemplateEditor } from "./outline-template-editor";
import { RowListEditor } from "./list-editor";
import { AutopilotSettings } from "./autopilot-settings";
import type { ProfileSection } from "@/lib/ai/prompts/channel";
import { FONT_OPTIONS, LANGUAGES, fontSupports, getLanguage, type FontKey } from "@/lib/languages";
import { contrastRatio, readableOn } from "@/lib/color";
import { Button, Card, ErrorNote, Input, Label, Select, Textarea } from "./ui";

type Props = { value: ChannelProfile; onChange: (p: ChannelProfile) => void };

const lines = (xs: string[]) => xs.join("\n");
const unlines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

/** Essentials, structure, Autopilot and angles up front; everything else in collapsed "Advanced" sections. */
export function ProfileEditor({ value: p, onChange }: Props) {
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
        title="Essentials"
        subtitle="What most edits need. Everything else follows from these."
        section="essentials"
        profile={p}
        onChange={onChange}
        placeholder="e.g. make the voice more playful and aimed at teenagers"
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <Label>Channel name</Label>
            <Input value={p.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label hint="minutes">Video length</Label>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                step={0.25}
                min={0.25}
                className="w-20"
                value={len.minMinutes}
                onChange={(e) => set("lengthMinutes", { min: Number(e.target.value), max: len.maxMinutes })}
                aria-label="Minimum minutes"
              />
              <span className="text-stone-400">–</span>
              <Input
                type="number"
                step={0.25}
                min={0.25}
                className="w-20"
                value={len.maxMinutes}
                onChange={(e) => set("lengthMinutes", { min: len.minMinutes, max: Number(e.target.value) })}
                aria-label="Maximum minutes"
              />
            </div>
            <div className="mt-1 text-[11px] text-stone-500">
              Scripts aim for ≈ {len.minWords}–{len.maxWords} words ({len.wpm} wpm{len.measured ? ", your voice's measured speed" : ""})
            </div>
          </div>
        </div>
        <div>
          <Label hint="script, captions, titles and on-screen text">Language</Label>
          <Select value={getLanguage(p.language).code} onChange={(e) => set("language", e.target.value)} className="max-w-xs">
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native}
                {l.native !== l.name ? ` (${l.name})` : ""}
              </option>
            ))}
          </Select>
        </div>
        {field("Niche", p.niche, (v) => set("niche", v), 3)}
        {field("Narration voice", p.voice, (v) => set("voice", v))}
        {field(
          "Voice sample",
          p.voiceSample ?? "",
          (v) => set("voiceSample", v),
          4,
          "optional: paste 1–3 paragraphs you love; the AI copies the tone, not the content",
        )}
        {field("Art style", p.visual.styleAnchor, (v) => setV("styleAnchor", v), 2, "starts every image prompt")}
        <FontField profile={p} onChange={(v) => setV("font", v)} />
        {field("Main character", p.visual.mainCharacter, (v) => setV("mainCharacter", v), 3, "the more precise, the more consistent")}
      </Section>

      <Section
        title="Video structure"
        subtitle="The outline every video follows; the first part is the hook. Pick a built-in structure, edit its parts, or learn one from a video you like."
        section="outline"
        profile={p}
        onChange={onChange}
        placeholder="e.g. add a part where the viewer guesses before each reveal"
      >
        <OutlineTemplateEditor profile={p} onChange={onChange} />
      </Section>

      <Section
        id="autopilot"
        title="Autopilot"
        subtitle="What the Run autopilot button on a video does: which steps run by themselves and where it stops so you can review."
        profile={p}
        onChange={onChange}
      >
        <AutopilotSettings profile={p} onChange={onChange} />
      </Section>

      <Section
        id="angles"
        title="Idea angles (optional)"
        subtitle="Title formulas that work for this channel. Only used when generating ideas; pick which ones per run on the Ideas page. Leave empty to let the AI invent its own."
        section="angles"
        profile={p}
        onChange={onChange}
        placeholder="e.g. add two angles about myths people still believe"
      >
        <RowListEditor
          value={p.topicAngles}
          onChange={(v) => set("topicAngles", v.map((a) => ({ ...a, name: a.template })))}
          columns={[
            { key: "template", label: "Title formula", placeholder: "e.g. Why Did ___?" },
            { key: "description", label: "When it works", placeholder: "What kind of topic fits", width: 1.3 },
          ]}
          newRow={() => ({ id: Math.max(0, ...p.topicAngles.map((a) => a.id)) + 1, name: "", template: "", description: "" })}
          addLabel="Add angle"
        />
      </Section>

      <Advanced title="Pacing" hint="sentence length, speaking speed, images per sentence" profile={p} onChange={onChange}>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Max words per sentence"
            hint="short = faster, easier to follow"
            value={pace.maxWordsPerSentence}
            min={5}
            max={40}
            onChange={(v) => set("pacing", { ...pace, maxWordsPerSentence: v })}
          />
          <NumberField
            label="Narration speed"
            hint={
              pace.measuredWpm
                ? `words per minute; your voice measured ${pace.measuredWpm} wpm, which is used instead`
                : "words per minute; only turns minutes into words until a video is voiced"
            }
            value={pace.wordsPerMinute}
            min={90}
            max={260}
            onChange={(v) => set("pacing", { ...pace, wordsPerMinute: v })}
          />
          <NumberField
            label="Sentences per image"
            hint="1 = new image every sentence (costs more)"
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
              Camera cut at every sentence
              <span className="block text-xs text-stone-500">Zooms to another part of the same image, so the picture changes without generating more images.</span>
            </span>
          </label>
        </div>
      </Advanced>

      <Advanced title="Writing rules" hint="format, evidence, extra rules" section="story" profile={p} onChange={onChange}>
        {field("Format", p.format, (v) => set("format", v), 1, "kind of video, e.g. \"educational explainer, doodle animation\"; length is set in Essentials")}
        {field("Evidence rule", p.evidenceRule, (v) => set("evidenceRule", v), 3)}
        {field("Other script rules", lines(p.extraScriptRules), (v) => set("extraScriptRules", unlines(v)), 5, "one per line, e.g. rhythm or words to avoid")}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-orange-500"
            checked={polishEnabled(p)}
            onChange={(e) => set("polishPass", e.target.checked)}
          />
          <span>
            Natural-speech pass after writing the script
            <span className="block text-xs text-stone-500">
              A second AI pass that makes the script sound spoken, not written. Recommended for non-English channels; adds one Claude call per script.
            </span>
          </span>
        </label>
      </Advanced>

      <Advanced title="Visual system" hint="what to avoid, variants, devices, colors, backgrounds, frame types" section="visual" profile={p} onChange={onChange}>
        {field("Always avoid", p.visual.styleLock, (v) => setV("styleLock", v), 3, "ends every image prompt")}
        {field("Character variants", lines(p.visual.characterVariants), (v) => setV("characterVariants", unlines(v)), 3, "one per line")}
        {field("Visual devices & recurring props", lines(p.visual.conceptDevices), (v) => setV("conceptDevices", unlines(v)), 5, "one per line")}
        <div>
          <Label>Colors</Label>
          <div className="mb-3 flex flex-wrap gap-4">
            <ColorInput label="On-screen text" value={p.visual.textColor ?? "#E0302B"} onChange={(v) => setV("textColor", v)} />
            <ColorInput label="Text-frame paper" value={p.visual.paperColor ?? "#F5F1E6"} onChange={(v) => setV("paperColor", v)} />
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
          <Label hint="settings the scene planner picks from; neutral is required">Backgrounds</Label>
          <RowListEditor
            value={p.visual.backgrounds}
            onChange={(v) => setV("backgrounds", v)}
            columns={[
              { key: "key", label: "Key", placeholder: "night", mono: true, width: 0.7, locked: (b) => b.key === "neutral" },
              { key: "label", label: "Label", placeholder: "Night", width: 0.8 },
              { key: "description", label: "Looks like", placeholder: "dark blue sky with stars", width: 1.6 },
              { key: "mood", label: "Mood", placeholder: "calm / mystery", width: 0.9 },
            ]}
            canRemove={(b) => b.key !== "neutral"}
            newRow={() => ({ key: "", label: "", description: "", mood: "" })}
            addLabel="Add background"
          />
        </div>
        <div>
          <Label hint="kinds of shot; concept_text is plain text drawn by code">Frame types</Label>
          <RowListEditor
            value={p.visual.frameTypes}
            onChange={(v) => setV("frameTypes", v)}
            columns={[
              { key: "key", label: "Key", placeholder: "close_up", mono: true, width: 0.7, locked: (f) => f.key === "concept_text" },
              { key: "label", label: "Label", placeholder: "Close-up", width: 0.8 },
              { key: "description", label: "What it shows", placeholder: "the character's face, big expression", width: 2 },
            ]}
            canRemove={(f) => f.key !== "concept_text"}
            newRow={() => ({ key: "", label: "", description: "" })}
            addLabel="Add frame type"
          />
        </div>
      </Advanced>

      <Advanced title="Metadata rules" hint="titles, description, tags" section="metadata" profile={p} onChange={onChange}>
        {field("Rules", p.metadataRules, (v) => set("metadataRules", v), 4)}
      </Advanced>
    </div>
  );
}

const LEGACY_LABELS: Record<string, string> = {
  hookFormula: "Hook formula → added to the first part of Video structure",
  scriptRhythm: "Rhythm → added to Other script rules",
  narrativeArc: "Narrative arc → replaced by Video structure",
  artStyle: "Art style (text-only version) → Art style now uses the image style prefix",
  objects: "Objects & props → added to Visual devices",
};

/** Read-only copy of fields that older settings had, so nothing silently disappears after the merge. */
function LegacyNote({ profile, onChange }: { profile: ChannelProfile; onChange: (p: ChannelProfile) => void }) {
  const entries = Object.entries(profile.legacy ?? {}).filter(([, v]) => v);
  return (
    <details className="rounded-xl bg-amber-50 px-5 py-3 text-[13px] ring-1 ring-amber-200">
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-amber-900">Some older fields were merged into simpler ones.</span>
        <span className="text-amber-800">See what moved</span>
        <button
          type="button"
          className="ml-auto text-xs text-amber-800 underline-offset-2 hover:underline"
          onClick={(e) => {
            e.preventDefault();
            onChange({ ...profile, legacy: undefined });
          }}
        >
          Dismiss (then Save)
        </button>
      </summary>
      <dl className="mt-3 space-y-2">
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-medium text-amber-900">{LEGACY_LABELS[k] ?? k}</dt>
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
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const rewrite = useRewrite(profile, section, onChange);
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} icon={<Sparkles className="size-3.5" />}>
        Rewrite with AI
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
      <Input autoFocus className="h-8 min-w-[240px] flex-1 text-[13px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder ?? "How should this section change?"} />
      <Button size="sm" variant="primary" type="submit" loading={rewrite.isPending} disabled={!text.trim()}>
        Rewrite
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
        Cancel
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
  return (
    <details className="group rounded-xl bg-white ring-1 ring-stone-200">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-stone-500 transition-transform group-open:rotate-90" />
        <span className="font-semibold">{title}</span>
        <span className="text-[13px] text-stone-500">· {hint}</span>
        <span className="ml-auto text-[11px] font-medium uppercase tracking-wide text-stone-400">Advanced</span>
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
  const lang = getLanguage(profile.language);
  const chosen = profile.visual.font;
  const used = onScreenFont(profile);
  const colors = textColors(profile);
  const autoLabel = FONT_OPTIONS.find((f) => f.key === lang.font)?.label ?? LANGUAGE_FONT_LABELS[lang.font] ?? "hand-drawn";
  return (
    <div>
      <Label hint="text the app draws over images, text-only frames and Short titles; not inside AI images">On-screen text font</Label>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={chosen ?? ""} onChange={(e) => onChange((e.target.value || undefined) as FontKey | undefined)} className="max-w-xs">
          <option value="">Auto ({autoLabel} for {lang.name})</option>
          {FONT_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {FONT_OPTIONS.filter((f) => f.group === g).map((f) => {
                const ok = fontSupports(f.key, lang.code);
                return (
                  <option key={f.key} value={f.key} disabled={!ok}>
                    {f.label}
                    {ok ? "" : ` (doesn't support ${lang.name})`}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </Select>
        <span
          className="rounded-lg px-4 py-2 text-2xl leading-tight ring-1 ring-stone-200"
          style={{ background: colors.paper, color: colors.text, fontFamily: handFont(used) }}
          title="How on-screen text looks with your colors"
        >
          {lang.code === "vi" ? "300.000 NĂM TRƯỚC" : "300,000 YEARS AGO"}
        </span>
      </div>
      {chosen && chosen !== used ? (
        <p className="mt-1 text-[11px] text-amber-700">This font can&apos;t show {lang.name}, so the language&apos;s default font is used.</p>
      ) : null}
    </div>
  );
}

/** Shorts captions on the paper: auto (white or dark, whichever reads) or a fixed color, with a contrast warning. */
function CaptionColorField({ value, paper, onChange }: { value?: string; paper: string; onChange: (v: string | undefined) => void }) {
  const auto = readableOn(paper);
  const low = value ? contrastRatio(value, paper) < 3 : false;
  return (
    <div className="mb-3 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200">
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-[13px] font-medium">Shorts captions</span>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" className="size-4 accent-orange-500" checked={!value} onChange={(e) => onChange(e.target.checked ? undefined : auto)} />
          Auto
        </label>
        {value ? (
          <div className="w-48">
            <ColorInput label="Color" value={value} onChange={onChange} />
          </div>
        ) : null}
        <span
          className="rounded px-2.5 py-1 text-[13px] font-extrabold"
          style={{ background: paper, color: value ?? auto }}
          title="How captions look on the paper color"
        >
          Sample caption
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-stone-500">
        Used in the stacked Short layout, where captions sit on the paper color. Auto picks white or dark, whichever reads better.
      </p>
      {low ? <p className="mt-1 text-[11px] text-amber-700">Hard to read on this background. Pick a lighter or darker color, or use Auto.</p> : null}
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
