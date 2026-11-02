"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Trash2 } from "lucide-react";
import { useProjectAction, type ProjectData } from "@/lib/client";
import { stepsFor, type StepKey } from "@/lib/types";
import type { Job } from "@/lib/db/schema";
import { modelLabel } from "@/lib/claude-models";
import { Button, ErrorNote, Progress } from "./ui";
import { fmtBytes } from "./render-history";

export function StepHeader({
  title,
  description,
  actions,
  models,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Claude models used on this page, shown as a muted line (links to Settings). */
  models?: { label: string; model: string }[];
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-0.5 max-w-2xl text-sm text-stone-600">{description}</p> : null}
        {models?.length ? (
          <Link href="/settings#claude" className="mt-1 inline-block text-xs text-stone-500 hover:text-stone-800 hover:underline">
            {models.map((m) => `${m.label}: Claude ${modelLabel(m.model)}`).join(" · ")}
          </Link>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StaleBanner({ data, step, children }: { data: ProjectData; step: StepKey; children: React.ReactNode }) {
  if (!data.project.stale[step]) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function JobBar({ job }: { job?: Job }) {
  if (!job) return null;
  if (job.status === "error") return <ErrorNote error={job.error} />;
  if (job.status !== "running") return null;
  return (
    <div className="rounded-lg bg-white p-3 ring-1 ring-stone-200">
      <div className="mb-1.5 flex justify-between text-xs text-stone-600">
        <span>{job.message ?? "Working…"}</span>
        <span className="tabular-nums">{Math.round(job.progress * 100)}%</span>
      </div>
      <Progress value={job.progress} />
    </div>
  );
}

/** Sticky footer with the step's primary "Approve & continue" action. */
export function StepFooter({
  data,
  step,
  canApprove,
  hint,
  children,
}: {
  data: ProjectData;
  step: StepKey;
  canApprove: boolean;
  hint?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const act = useProjectAction(data.project.id);
  const router = useRouter();
  const steps = stepsFor(data.channel.kind, data.project.voiceMode);
  const i = steps.findIndex((s) => s.key === step);
  const next = steps[i + 1];
  const approved = Boolean(data.project.approvals[step]) && !data.project.stale[step];
  return (
    <div className="sticky bottom-0 z-20 -mx-1 mt-8 border-t border-stone-200 bg-background/95 px-1 py-3 backdrop-blur">
      {act.error ? (
        <div className="mb-2">
          <ErrorNote error={act.error} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 text-sm text-stone-600">{children ?? hint}</div>
        {approved ? (
          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="size-4" /> Approved
          </span>
        ) : null}
        {approved && !next && data.generatedVideoBytes > 0 ? <CleanupButton data={data} /> : null}
        {approved && next ? (
          <Link href={`/projects/${data.project.id}/${next.path}`}>
            <Button variant="primary" icon={<ArrowRight className="size-4" />}>
              {next.label}
            </Button>
          </Link>
        ) : (
          <Button
            variant="primary"
            disabled={!canApprove}
            loading={act.isPending}
            onClick={() =>
              act.mutate(
                { action: "approve", step },
                { onSuccess: () => next && router.push(`/projects/${data.project.id}/${next.path}`) },
              )
            }
            icon={<CheckCircle2 className="size-4" />}
          >
            {next ? "Approve & continue" : "Mark done"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** On a finished project: delete the rendered MP4s (video + Shorts) to free disk space; voice and images stay. */
function CleanupButton({ data }: { data: ProjectData }) {
  const act = useProjectAction(data.project.id);
  const size = fmtBytes(data.generatedVideoBytes);
  return (
    <Button
      variant="secondary"
      loading={act.isPending}
      icon={<Trash2 className="size-4" />}
      onClick={() =>
        confirm(
          `Delete the generated videos (${size})?\n\nThis removes every render of the video and its Shorts, including the render history. Voice, images and thumbnails are kept, so you can render again later.`,
        ) && act.mutate({ action: "deleteGeneratedVideos" })
      }
    >
      Free {size}
    </Button>
  );
}
