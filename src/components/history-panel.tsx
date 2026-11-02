"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, RotateCcw, X } from "lucide-react";
import { api, useProjectAction } from "@/lib/client";
import type { TextVersion } from "@/lib/db/schema";
import type { Outline } from "@/lib/types";
import { changedLines } from "@/lib/history-rules";
import { wordCount } from "@/lib/sync";
import { fmtWhen } from "./render-history";
import { Badge, Button, ErrorNote, Spinner, Tabs, cn } from "./ui";

type Kind = "script" | "outline";

const SOURCE: Record<TextVersion["source"], { label: string; tone: "brand" | "neutral" | "blue" | "green" | "amber" }> = {
  ai: { label: "AI", tone: "brand" },
  edit: { label: "Edited", tone: "neutral" },
  rewrite: { label: "Rewrite", tone: "blue" },
  restore: { label: "Restored", tone: "green" },
  initial: { label: "Original", tone: "amber" },
};

/** Outline JSON → readable lines for preview and diffing. */
function outlineText(json: string) {
  try {
    const o = JSON.parse(json) as Outline;
    return [...o.sections.flatMap((s) => [`${s.title}`, ...s.beats.map((b) => `  • ${b}`), ""]), `Evidence: ${o.evidence.join("; ")}`].join("\n");
  } catch {
    return json;
  }
}

/** Side panel listing saved versions of the script and outline, with preview and restore. */
export function HistoryPanel({
  projectId,
  currentScript,
  currentOutline,
  onClose,
  onRestored,
  locale = "en",
}: {
  locale?: string;
  projectId: string;
  currentScript: string;
  currentOutline: Outline | null;
  onClose: () => void;
  onRestored: (kind: Kind, content: string) => void;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("script");
  const [selected, setSelected] = useState<string | null>(null);
  const act = useProjectAction(projectId);
  const versions = useQuery({
    queryKey: ["versions", projectId, kind],
    queryFn: () => api<{ versions: TextVersion[] }>(`/api/projects/${projectId}`, { json: { action: "listVersions", kind } }),
  });
  const list = versions.data?.versions ?? [];
  const current = kind === "script" ? currentScript : currentOutline ? JSON.stringify(currentOutline) : "";
  const pick = list.find((v) => v.id === selected) ?? null;
  // Only the newest version matching what's on screen is "Current" (a restore duplicates older text).
  const currentId = list.find((v) => v.content === current)?.id;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const preview = useMemo(() => {
    if (!pick) return null;
    const text = kind === "script" ? pick.content : outlineText(pick.content);
    const now = kind === "script" ? current : current ? outlineText(current) : "";
    return { lines: text.split("\n"), changed: changedLines(now, text) };
  }, [pick, kind, current]);

  async function restore(v: TextVersion) {
    await act.mutateAsync({ action: "restoreVersion", versionId: v.id });
    onRestored(v.kind, v.content);
    qc.invalidateQueries({ queryKey: ["versions", projectId] });
    setSelected(null);
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Version history"
        className="flex h-full w-full max-w-2xl flex-col bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-stone-200 px-5 py-3">
          <History className="size-4 text-stone-500" />
          <h2 className="font-semibold">History</h2>
          <Tabs<Kind>
            value={kind}
            onChange={(k) => (setKind(k), setSelected(null))}
            items={[
              { value: "script", label: "Script" },
              { value: "outline", label: "Outline" },
            ]}
          />
          <Button size="sm" variant="ghost" className="ml-auto" aria-label="Close history" onClick={onClose} icon={<X className="size-4" />} />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)]">
          <ul className="overflow-y-auto border-r border-stone-200">
            {versions.isLoading ? (
              <li className="p-4">
                <Spinner />
              </li>
            ) : !list.length ? (
              <li className="p-4 text-sm text-stone-500">No versions yet.</li>
            ) : (
              list.map((v) => {
                const s = SOURCE[v.source];
                const isCurrent = v.id === currentId;
                return (
                  <li key={v.id}>
                    <button
                      onClick={() => setSelected(v.id)}
                      className={cn("w-full border-b border-stone-100 px-4 py-2.5 text-left hover:bg-stone-100", selected === v.id && "bg-orange-50")}
                    >
                      <div className="flex items-center gap-1.5 text-[13px] font-medium">
                        {fmtWhen(v.createdAt)}
                        {isCurrent ? <Badge tone="green">Current</Badge> : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                        <Badge tone={s.tone}>{s.label}</Badge>
                        {kind === "script" ? `${wordCount(v.content, locale).toLocaleString()} words` : `${(JSON.parse(v.content) as Outline).sections?.length ?? 0} sections`}
                      </div>
                      {v.note ? <div className="mt-0.5 truncate text-xs italic text-stone-500">“{v.note}”</div> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="flex min-h-0 flex-col">
            {!pick || !preview ? (
              <div className="grid flex-1 place-items-center p-6 text-center text-sm text-stone-500">
                Pick a version to preview it. Restoring never deletes anything: it becomes the newest version.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b border-stone-200 px-5 py-2.5">
                  <span className="text-xs text-stone-500">
                    <span className="mr-1 inline-block size-2.5 rounded-sm bg-emerald-200 align-middle" /> lines not in the current {kind}
                  </span>
                  <Button
                    size="sm"
                    variant="primary"
                    className="ml-auto"
                    disabled={pick.content === current}
                    loading={act.isPending}
                    onClick={() => restore(pick)}
                    icon={<RotateCcw className="size-3.5" />}
                  >
                    {pick.content === current ? "This is current" : "Restore this version"}
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 font-[Georgia,serif] text-[14px] leading-7 text-stone-800">
                  {preview.lines.map((l, i) => (
                    <div key={i} className={cn("whitespace-pre-wrap rounded px-1", preview.changed.has(i) && "bg-emerald-100")}>
                      {l || " "}
                    </div>
                  ))}
                </div>
                <div className="px-5 pb-3">
                  <ErrorNote error={act.error} />
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
