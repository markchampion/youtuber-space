"use client";

import Link from "next/link";
import { Pause, Play, RotateCcw, Square, Zap } from "lucide-react";
import { AUTO_STEPS, AUTO_STEP_LABELS, autopilotOf, type AutoStep, type AutopilotConfig } from "@/lib/channel";
import { runningJob, useProjectAction, type ProjectData } from "@/lib/client";
import { STEPS } from "@/lib/types";
import { autoStepLabel, useT, type T } from "@/lib/i18n";
import { JobBar } from "./step";
import { Button, ErrorNote, cn } from "./ui";

/** Page each Autopilot step is reviewed on. The outline lives on the Script page. */
function stepHref(projectId: string, step: AutoStep) {
  const key = step === "outline" ? "script" : step;
  return `/projects/${projectId}/${STEPS.find((s) => s.key === key)?.path ?? "script"}`;
}

function summary(t: T, cfg: AutopilotConfig, from: AutoStep = "outline", ad = false, silent = false) {
  // Ads are written from the product brief: no outline step. Silent ads have no voice step.
  const run = AUTO_STEPS.slice(AUTO_STEPS.indexOf(from), AUTO_STEPS.indexOf(cfg.stopAfter) + 1).filter(
    (s) => !(ad && s === "outline") && !(silent && s === "voice"),
  );
  const pauses = cfg.pauseAfter.filter((s) => run.includes(s) && s !== cfg.stopAfter);
  const label = (s: AutoStep) => autoStepLabel(t, s, AUTO_STEP_LABELS[s]);
  return { steps: run.map(label).join(" → "), pauses: pauses.map(label).join(", ") };
}

const CHILD_JOBS = ["voice", "scenes", "images", "render"];

/** Run / pause / continue strip shown on every step of a video. */
export function AutopilotBar({ data }: { data: ProjectData }) {
  const t = useT();
  const stepName = (s: AutoStep) => autoStepLabel(t, s, AUTO_STEP_LABELS[s]);
  const act = useProjectAction(data.project.id);
  const a = data.project.autopilot;
  const job = runningJob(data, "autopilot");
  const child = CHILD_JOBS.map((t) => runningJob(data, t)).find(Boolean);
  const cfg = autopilotOf(data.channel.profile);
  const ad = data.channel.kind === "product_ad";
  const silent = data.project.voiceMode === "none";
  const pending = act.isPending;

  const box = (tone: "neutral" | "running" | "paused" | "error", children: React.ReactNode) => (
    <div
      className={cn(
        "mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3 text-sm ring-1",
        tone === "neutral" && "bg-white ring-stone-200",
        tone === "running" && "bg-orange-50/60 ring-orange-200",
        tone === "paused" && "bg-amber-50 ring-amber-200",
        tone === "error" && "bg-red-50 ring-red-200",
      )}
    >
      {children}
      {act.error ? (
        <div className="w-full">
          <ErrorNote error={act.error} />
        </div>
      ) : null}
    </div>
  );

  // Running
  if (job || (a?.status === "running" && !a.interrupted)) {
    const stopping = a?.status === "stopped";
    return box(
      "running",
      <>
        <Zap className="size-4 shrink-0 text-orange-600" />
        <span className="font-medium">{a ? t("nav.autopilot.runningAt", { step: stepName(a.step) }) : t("nav.autopilot.name")}</span>
        <span className="text-stone-600">{stopping ? t("nav.autopilot.willStop") : summary(t, a?.config ?? cfg, a?.from, ad, silent).steps}</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          disabled={stopping}
          loading={pending && act.variables?.action === "autopilotStop"}
          icon={<Square className="size-3.5" />}
          onClick={() => act.mutate({ action: "autopilotStop" })}
          title={t("nav.autopilot.stopTitle")}
        >
          {t("nav.autopilot.stopAfter")}
        </Button>
        <div className="w-full space-y-2">
          <JobBar job={job} />
          {child ? <JobBar job={child} /> : null}
        </div>
      </>,
    );
  }

  // Paused at a review checkpoint, or because something needs fixing
  if (a?.status === "paused") {
    return box(
      "paused",
      <>
        <Pause className="size-4 shrink-0 text-amber-700" />
        <span className="font-medium text-amber-900">
          {a.pausedReason ? t("nav.autopilot.pausedAt", { step: stepName(a.step) }) : t("nav.autopilot.pausedForReview", { step: stepName(a.step) })}
        </span>
        <span className="text-amber-900/80">{a.pausedReason ?? t("nav.autopilot.editHint")}</span>
        <Link href={stepHref(data.project.id, a.step)} className="text-amber-900 underline underline-offset-2">
          {t("nav.autopilot.open", { step: stepName(a.step) })}
        </Link>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => act.mutate({ action: "autopilotStop" })} disabled={pending}>
            {t("nav.autopilot.stop")}
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Play className="size-3.5" />}
            loading={pending && act.variables?.action === "autopilotContinue"}
            onClick={() => act.mutate({ action: "autopilotContinue" })}
          >
            {t("nav.autopilot.continue")}
          </Button>
        </div>
      </>,
    );
  }

  // Failed, or the server stopped mid-run
  if (a?.status === "error" || a?.interrupted) {
    return box(
      "error",
      <>
        <RotateCcw className="size-4 shrink-0 text-red-700" />
        <span className="font-medium text-red-900">
          {t(a.interrupted ? "nav.autopilot.interruptedAt" : "nav.autopilot.failedAt", { step: stepName(a.step) })}
        </span>
        <span className="min-w-0 flex-1 truncate text-red-900/80" title={a.error}>
          {a.interrupted ? t("nav.autopilot.serverRestarted") : a.error}
        </span>
        <Button size="sm" variant="ghost" onClick={() => act.mutate({ action: "autopilotStop" })} disabled={pending}>
          {t("nav.autopilot.dismiss")}
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={<RotateCcw className="size-3.5" />}
          loading={pending && act.variables?.action === "autopilotContinue"}
          onClick={() => act.mutate({ action: "autopilotContinue" })}
        >
          {t("nav.autopilot.retryFrom", { step: stepName(a.step) })}
        </Button>
      </>,
    );
  }

  // Idle, done or stopped
  const s = summary(t, cfg, undefined, ad, silent);
  return box(
    "neutral",
    <>
      <Zap className="size-4 shrink-0 text-stone-500" />
      <span className="text-stone-700">
        <span className="font-medium">{t("nav.autopilot.name")}</span> {t("nav.autopilot.runs", { steps: s.steps })}
        {s.pauses ? <span className="text-stone-500"> · {t("nav.autopilot.pausesAfter", { steps: s.pauses })}</span> : null}
        {a?.status === "done" ? <span className="text-emerald-700"> · {t("nav.autopilot.lastFinished")}</span> : null}
        {a?.status === "stopped" ? <span className="text-stone-500"> · {t("nav.autopilot.lastStopped", { step: stepName(a.step) })}</span> : null}
      </span>
      <Link href="/channel#autopilot" className="text-xs text-stone-500 underline-offset-2 hover:underline">
        {t("nav.autopilot.change")}
      </Link>
      <Button
        size="sm"
        variant="primary"
        className="ml-auto"
        icon={<Zap className="size-3.5" />}
        loading={pending && act.variables?.action === "autopilot"}
        title={t("nav.autopilot.runTitle")}
        onClick={() => act.mutate({ action: "autopilot" })}
      >
        {t("nav.autopilot.run")}
      </Button>
    </>,
  );
}
