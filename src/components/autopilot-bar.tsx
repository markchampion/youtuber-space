"use client";

import Link from "next/link";
import { Pause, Play, RotateCcw, Square, Zap } from "lucide-react";
import { AUTO_STEPS, AUTO_STEP_LABELS, autopilotOf, type AutoStep, type AutopilotConfig } from "@/lib/channel";
import { runningJob, useProjectAction, type ProjectData } from "@/lib/client";
import { STEPS } from "@/lib/types";
import { JobBar } from "./step";
import { Button, ErrorNote, cn } from "./ui";

/** Page each Autopilot step is reviewed on. The outline lives on the Script page. */
function stepHref(projectId: string, step: AutoStep) {
  const key = step === "outline" ? "script" : step;
  return `/projects/${projectId}/${STEPS.find((s) => s.key === key)?.path ?? "script"}`;
}

function summary(cfg: AutopilotConfig, from: AutoStep = "outline", ad = false, silent = false) {
  // Ads are written from the product brief: no outline step. Silent ads have no voice step.
  const run = AUTO_STEPS.slice(AUTO_STEPS.indexOf(from), AUTO_STEPS.indexOf(cfg.stopAfter) + 1).filter(
    (s) => !(ad && s === "outline") && !(silent && s === "voice"),
  );
  const pauses = cfg.pauseAfter.filter((s) => run.includes(s) && s !== cfg.stopAfter);
  return { steps: run.map((s) => AUTO_STEP_LABELS[s]).join(" → "), pauses: pauses.map((s) => AUTO_STEP_LABELS[s]).join(", ") };
}

const CHILD_JOBS = ["voice", "scenes", "images", "render"];

/** Run / pause / continue strip shown on every step of a video. */
export function AutopilotBar({ data }: { data: ProjectData }) {
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
        <span className="font-medium">Autopilot{a ? `: ${AUTO_STEP_LABELS[a.step]}` : ""}</span>
        <span className="text-stone-600">{stopping ? "will stop after this step" : `${summary(a?.config ?? cfg, a?.from, ad, silent).steps}`}</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          disabled={stopping}
          loading={pending && act.variables?.action === "autopilotStop"}
          icon={<Square className="size-3.5" />}
          onClick={() => act.mutate({ action: "autopilotStop" })}
          title="Stops after the current step. A step that's already running finishes first."
        >
          Stop after this step
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
          {a.pausedReason ? `Autopilot paused at ${AUTO_STEP_LABELS[a.step]}` : `Autopilot paused after ${AUTO_STEP_LABELS[a.step]} for your review`}
        </span>
        <span className="text-amber-900/80">{a.pausedReason ?? "Edit anything you like; Continue approves it as it is now."}</span>
        <Link href={stepHref(data.project.id, a.step)} className="text-amber-900 underline underline-offset-2">
          Open {AUTO_STEP_LABELS[a.step]}
        </Link>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => act.mutate({ action: "autopilotStop" })} disabled={pending}>
            Stop
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Play className="size-3.5" />}
            loading={pending && act.variables?.action === "autopilotContinue"}
            onClick={() => act.mutate({ action: "autopilotContinue" })}
          >
            Continue autopilot
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
          Autopilot {a.interrupted ? "was interrupted" : "failed"} at {AUTO_STEP_LABELS[a.step]}
        </span>
        <span className="min-w-0 flex-1 truncate text-red-900/80" title={a.error}>
          {a.interrupted ? "The server restarted while it was running." : a.error}
        </span>
        <Button size="sm" variant="ghost" onClick={() => act.mutate({ action: "autopilotStop" })} disabled={pending}>
          Dismiss
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={<RotateCcw className="size-3.5" />}
          loading={pending && act.variables?.action === "autopilotContinue"}
          onClick={() => act.mutate({ action: "autopilotContinue" })}
        >
          Retry from {AUTO_STEP_LABELS[a.step]}
        </Button>
      </>,
    );
  }

  // Idle, done or stopped
  const s = summary(cfg, undefined, ad, silent);
  return box(
    "neutral",
    <>
      <Zap className="size-4 shrink-0 text-stone-500" />
      <span className="text-stone-700">
        <span className="font-medium">Autopilot</span> runs {s.steps}
        {s.pauses ? <span className="text-stone-500"> · pauses after {s.pauses}</span> : null}
        {a?.status === "done" ? <span className="text-emerald-700"> · last run finished</span> : null}
        {a?.status === "stopped" ? <span className="text-stone-500"> · last run stopped at {AUTO_STEP_LABELS[a.step]}</span> : null}
      </span>
      <Link href="/channel#autopilot" className="text-xs text-stone-500 underline-offset-2 hover:underline">
        change
      </Link>
      <Button
        size="sm"
        variant="primary"
        className="ml-auto"
        icon={<Zap className="size-3.5" />}
        loading={pending && act.variables?.action === "autopilot"}
        title="Steps that are already done are skipped"
        onClick={() => act.mutate({ action: "autopilot" })}
      >
        Run autopilot
      </Button>
    </>,
  );
}
