"use client";

import { AlertTriangle, BookOpen, Check, Sparkles } from "lucide-react";
import { EVAL_CRITERIA, type IdeaEvaluation } from "@/lib/types";
import type { ChannelProfile } from "@/lib/channel";
import { angleName } from "@/lib/channel";
import { Badge, Button, cn } from "./ui";

const VERDICT = {
  go: { label: "Go", tone: "green", text: "Strong idea, ready to develop." },
  improve: { label: "Improve", tone: "amber", text: "Good core — try one of the sharper versions below." },
  skip: { label: "Skip", tone: "red", text: "Weak fit for this channel." },
} as const;

function scoreColor(n: number) {
  return n >= 8 ? "bg-emerald-500" : n >= 6 ? "bg-amber-400" : "bg-red-400";
}

export function ScoreRing({ value, size = 64 }: { value: number; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const color = value >= 8 ? "#10b981" : value >= 6 ? "#f59e0b" : "#f87171";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-label={`Score ${value.toFixed(1)} of 10`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e7e5e4" strokeWidth={6} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${(value / 10) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-stone-900 text-[15px] font-semibold">
        {value.toFixed(1)}
      </text>
    </svg>
  );
}

export function Scorecard({
  evaluation,
  profile,
  onUse,
  starting,
}: {
  evaluation: IdeaEvaluation;
  profile: ChannelProfile;
  onUse: (v: { title?: string; angle?: number; hook?: string }) => void;
  starting?: boolean;
}) {
  const v = VERDICT[evaluation.verdict];
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <ScoreRing value={evaluation.overall} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={v.tone}>{v.label}</Badge>
            <span className="text-sm text-stone-600">{v.text}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-stone-800">{evaluation.summary}</p>
          <div className="mt-2 text-xs text-stone-500">Closest angle: {angleName(profile, evaluation.closestAngle)}</div>
        </div>
      </div>

      <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {EVAL_CRITERIA.map(([key, label]) => {
          const n = evaluation.scores[key];
          return (
            <div key={key}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-stone-600">{label}</span>
                <span className="font-medium tabular-nums">{n}/10</span>
              </div>
              <div className="h-1.5 rounded-full bg-stone-200">
                <div className={cn("h-full rounded-full", scoreColor(n))} style={{ width: `${n * 10}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            <Check className="size-3.5" /> Strengths
          </div>
          <ul className="space-y-1 text-sm text-stone-700">
            {evaluation.strengths.map((s, i) => (
              <li key={i}>• {s}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <AlertTriangle className="size-3.5" /> Risks
          </div>
          <ul className="space-y-1 text-sm text-stone-700">
            {evaluation.risks.map((s, i) => (
              <li key={i}>• {s}</li>
            ))}
          </ul>
        </div>
      </div>

      {evaluation.evidenceLeads.length ? (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-600">
            <BookOpen className="size-3.5" /> Evidence leads
          </div>
          <div className="flex flex-wrap gap-1.5">
            {evaluation.evidenceLeads.map((e, i) => (
              <Badge key={i}>{e}</Badge>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-ink">
          <Sparkles className="size-3.5" /> Sharper versions
        </div>
        <div className="space-y-2">
          {evaluation.improvedVersions.map((iv, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{iv.title}</div>
                <div className="mt-0.5 text-sm italic text-stone-600">“{iv.hook}”</div>
                <div className="mt-1 text-xs text-stone-500">
                  {angleName(profile, iv.angle)} · {iv.why}
                </div>
              </div>
              <Button size="sm" variant="secondary" loading={starting} onClick={() => onUse(iv)}>
                Use this
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
