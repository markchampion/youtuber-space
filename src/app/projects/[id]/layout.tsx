"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { AlertTriangle, Check, Loader2, Pause } from "lucide-react";
import { AutopilotBar } from "@/components/autopilot-bar";
import { runningJob, useProject } from "@/lib/client";
import { stepsFor } from "@/lib/types";
import { angleName } from "@/lib/channel";
import { Badge, Spinner, cn, fmtTime, fmtUsd } from "@/components/ui";

const JOB_FOR_STEP: Record<string, string> = { voice: "voice", scenes: "scenes", images: "images", render: "render", shorts: "short" };

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const path = usePathname();
  const { data, error } = useProject(id);

  if (error) return <div className="p-8 text-sm text-red-700">{String(error)}</div>;
  if (!data) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }
  const { project, channel } = data;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-stone-200 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <Link href="/" className="hover:text-stone-800">
              Videos
            </Link>
            <span>/</span>
            {angleName(channel.profile, project.angle) !== "—" ? <Badge tone="brand">{angleName(channel.profile, project.angle)}</Badge> : null}
          </div>
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight">{project.title}</h1>
        </div>
        <div className="flex items-center gap-4 text-sm text-stone-600">
          {project.audioDuration ? <span title="Narration length">⏱ {fmtTime(project.audioDuration)}</span> : null}
          <span title="API spend on this video so far">
            Spent {fmtUsd(data.cost)}
            {data.cliCalls ? (
              <span className="text-stone-400" title="Calls that ran on your Claude / ChatGPT plan (no per-call charge)">
                {" "}
                + {data.cliCalls} plan call{data.cliCalls === 1 ? "" : "s"}
              </span>
            ) : null}
          </span>
        </div>
      </div>

      <AutopilotBar data={data} />

      <div className="flex flex-1 flex-col gap-6 py-6 lg:flex-row">
        <nav aria-label="Pipeline steps" className="lg:w-52 lg:shrink-0">
          <ol className="flex gap-1 overflow-x-auto lg:sticky lg:top-20 lg:flex-col">
            {stepsFor(channel.kind, project.voiceMode).map((s, i) => {
              const href = `/projects/${id}/${s.path}`;
              const active = path.startsWith(href);
              const approved = Boolean(project.approvals[s.key]);
              const stale = Boolean(project.stale[s.key]);
              const busy = JOB_FOR_STEP[s.key] && runningJob(data, JOB_FOR_STEP[s.key]);
              const pilot = project.autopilot;
              // The outline is reviewed on the Script step.
              const paused = pilot?.status === "paused" && (pilot.step === s.key || (pilot.step === "outline" && s.key === "script"));
              return (
                <li key={s.key}>
                  <Link
                    href={href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm whitespace-nowrap",
                      active ? "bg-white font-medium text-stone-900 shadow-sm ring-1 ring-stone-200" : "text-stone-600 hover:bg-stone-200/50",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                        busy
                          ? "bg-orange-100 text-brand-ink"
                          : paused
                            ? "bg-amber-400 text-white"
                          : stale
                            ? "bg-amber-100 text-amber-800"
                            : approved
                              ? "bg-emerald-500 text-white"
                              : active
                                ? "bg-stone-900 text-white"
                                : "bg-stone-200 text-stone-600",
                      )}
                    >
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : paused ? <Pause className="size-3.5" /> : stale ? <AlertTriangle className="size-3.5" /> : approved ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    <span>{s.label}</span>
                    {stale ? <span className="sr-only">(needs review)</span> : null}
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
