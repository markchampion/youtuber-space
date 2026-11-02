"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GraduationCap, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { pacingOf, type ChannelProfile, type OutlineBeat, type OutlineTemplate } from "@/lib/channel";
import { DEFAULT_OUTLINE_TEMPLATE, OUTLINE_TEMPLATES } from "@/lib/outline-templates";
import type { TranscriptAnalysis } from "@/lib/types";
import { Badge, Button, ErrorNote, Input, Label, Select, Textarea } from "./ui";

type Stats = { words: number; sentences: number; avgWordsPerSentence: number; wordsPerMinute: number | null };

/** Edit the structure every outline follows, pick a built-in one, or learn one from a transcript. */
export function OutlineTemplateEditor({ profile, onChange }: { profile: ChannelProfile; onChange: (p: ChannelProfile) => void }) {
  const t: OutlineTemplate = profile.outlineTemplate?.beats?.length ? profile.outlineTemplate : DEFAULT_OUTLINE_TEMPLATE;
  const setT = (next: OutlineTemplate) => onChange({ ...profile, outlineTemplate: next });
  const setBeat = (i: number, patch: Partial<OutlineBeat>) => setT({ ...t, beats: t.beats.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const move = (i: number, d: -1 | 1) => {
    const beats = [...t.beats];
    [beats[i], beats[i + d]] = [beats[i + d], beats[i]];
    setT({ ...t, beats });
  };
  const total = t.beats.reduce((a, b) => a + (Number(b.share) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <Label>Structure name</Label>
          <Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
        </div>
        <div>
          <Label>Start from a built-in structure</Label>
          <Select
            className="w-60"
            value=""
            onChange={(e) => {
              const pick = OUTLINE_TEMPLATES.find((x) => x.name === e.target.value);
              if (pick && confirm(`Replace the current structure with "${pick.name}"? (Nothing is saved until you click Save profile.)`)) setT(structuredClone(pick));
            }}
          >
            <option value="">Choose…</option>
            {OUTLINE_TEMPLATES.map((x) => (
              <option key={x.name} value={x.name}>
                {x.name} ({x.beats.length} parts)
              </option>
            ))}
          </Select>
        </div>
      </div>

      <ol className="space-y-2">
        {t.beats.map((b, i) => (
          <li key={`${b.key}-${i}`} className="rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-stone-900 text-xs font-semibold text-white">{i + 1}</span>
              {i === 0 ? <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-800">Hook</span> : null}
              <Input className="h-8 min-w-[160px] flex-1 text-[13px] font-medium" value={b.name} onChange={(e) => setBeat(i, { name: e.target.value })} aria-label="Part name" />
              <div className="flex items-center gap-1 text-xs text-stone-500">
                <Input
                  type="number"
                  className="h-8 w-16 text-[13px]"
                  value={b.share}
                  min={1}
                  max={60}
                  onChange={(e) => setBeat(i, { share: Number(e.target.value) })}
                  aria-label="Share of the video in percent"
                />
                %
              </div>
              <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" icon={<ArrowUp className="size-3.5" />} />
              <Button size="sm" variant="ghost" disabled={i === t.beats.length - 1} onClick={() => move(i, 1)} aria-label="Move down" icon={<ArrowDown className="size-3.5" />} />
              <Button
                size="sm"
                variant="ghost"
                className="text-stone-400 hover:text-red-600"
                disabled={t.beats.length <= 2}
                onClick={() => setT({ ...t, beats: t.beats.filter((_, j) => j !== i) })}
                aria-label="Remove part"
                icon={<Trash2 className="size-3.5" />}
              />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Textarea rows={2} className="text-[13px]" placeholder="Purpose: what this part does for the viewer" value={b.purpose} onChange={(e) => setBeat(i, { purpose: e.target.value })} aria-label="Purpose" />
              <Textarea rows={2} className="text-[13px]" placeholder="Guidance: how it's written" value={b.guidance} onChange={(e) => setBeat(i, { guidance: e.target.value })} aria-label="Guidance" />
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus className="size-3.5" />}
          onClick={() => setT({ ...t, beats: [...t.beats, { key: `part_${t.beats.length + 1}`, name: "", purpose: "", guidance: "", share: 8 }] })}
        >
          Add part
        </Button>
        <span className={`text-xs ${Math.abs(total - 100) > 15 ? "text-amber-700" : "text-stone-500"}`}>Shares add up to {total}% (aim for ~100%)</span>
      </div>

      <LearnFromTranscript profile={profile} onChange={onChange} />
    </div>
  );
}

function LearnFromTranscript({ profile, onChange }: { profile: ChannelProfile; onChange: (p: ChannelProfile) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const analyze = useMutation({
    mutationFn: () => api<{ stats: Stats; analysis: TranscriptAnalysis }>("/api/channels", { json: { action: "analyzeTranscript", profile, transcript: text } }),
  });
  const r = analyze.data;

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} icon={<GraduationCap className="size-3.5" />}>
        Learn from a video you like
      </Button>
    );
  }
  return (
    <div className="space-y-3 rounded-lg bg-orange-50/60 p-4 ring-1 ring-orange-200">
      <div>
        <div className="font-medium">Learn from a video you like</div>
        <p className="text-[13px] text-stone-600">
          On YouTube, open the video → <b>…more</b> → <b>Show transcript</b>, select all of it and paste it here. The AI learns its structure, pacing and techniques, not its
          content.
        </p>
      </div>
      <Textarea rows={6} className="text-[13px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="0:00 This morning, a machine screamed at you until you woke up…" />
      <div className="flex gap-2">
        <Button variant="primary" size="sm" loading={analyze.isPending} disabled={text.trim().length < 500} onClick={() => analyze.mutate()}>
          Analyze
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      <ErrorNote error={analyze.error} />

      {r ? (
        <div className="space-y-3 border-t border-orange-200 pt-3 text-[13px]">
          <div className="flex flex-wrap gap-2">
            <Badge>{r.stats.words.toLocaleString()} words</Badge>
            <Badge>{r.stats.avgWordsPerSentence} words per sentence</Badge>
            {r.stats.wordsPerMinute ? <Badge>{r.stats.wordsPerMinute} words per minute</Badge> : <Badge>no timestamps, so speed unknown</Badge>}
          </div>

          <div>
            <div className="mb-1 font-medium">Structure: {r.analysis.template.name}</div>
            <ol className="list-decimal space-y-0.5 pl-5 text-stone-700">
              {r.analysis.template.beats.map((b, i) => (
                <li key={i}>
                  <b>{b.name}</b> ({b.share}%): {b.purpose}
                </li>
              ))}
            </ol>
            <Button size="sm" className="mt-2" onClick={() => onChange({ ...profile, outlineTemplate: r.analysis.template })}>
              Use this structure
            </Button>
          </div>

          <div>
            <div className="mb-1 font-medium">Pacing</div>
            <Button
              size="sm"
              onClick={() =>
                onChange({
                  ...profile,
                  pacing: {
                    ...pacingOf(profile),
                    // Allow some variety above the average, like the original.
                    maxWordsPerSentence: Math.max(8, Math.round(r.stats.avgWordsPerSentence * 1.5)),
                    ...(r.stats.wordsPerMinute ? { wordsPerMinute: r.stats.wordsPerMinute } : {}),
                  },
                })
              }
            >
              Match its sentence length{r.stats.wordsPerMinute ? " and speed" : ""}
            </Button>
          </div>

          <div>
            <div className="mb-1 font-medium">Techniques</div>
            <ul className="list-disc space-y-0.5 pl-5 text-stone-700">
              {r.analysis.techniques.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
            <Button
              size="sm"
              className="mt-2"
              onClick={() => onChange({ ...profile, extraScriptRules: [...new Set([...profile.extraScriptRules, ...r.analysis.techniques])] })}
            >
              Add to script rules
            </Button>
          </div>

          {r.analysis.voiceSample ? (
            <div>
              <div className="mb-1 font-medium">Voice sample (new text in the same tone)</div>
              <p className="rounded bg-white p-2 italic text-stone-700 ring-1 ring-stone-200">{r.analysis.voiceSample}</p>
              <Button size="sm" className="mt-2" onClick={() => onChange({ ...profile, voiceSample: r.analysis.voiceSample })}>
                Use as voice sample
              </Button>
            </div>
          ) : null}
          <p className="text-xs text-stone-500">Nothing is saved until you click Save profile.</p>
        </div>
      ) : null}
    </div>
  );
}
