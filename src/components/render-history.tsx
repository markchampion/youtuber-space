"use client";

import { useState } from "react";
import { Download, Play, Trash2 } from "lucide-react";
import { useProjectAction, type RenderRow } from "@/lib/client";
import { Badge, Button, ErrorNote, cn, fmtTime } from "./ui";

export function fmtBytes(n: number | null | undefined) {
  if (!n) return "–";
  return n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${(n / 1e6).toFixed(1)} MB`;
}

export function fmtWhen(iso: string) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return today ? `Today ${time}` : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

function optionChips(o: RenderRow["options"]) {
  if (!o) return [];
  const chips: string[] = [];
  if (typeof o.speed === "number" && o.speed !== 1) chips.push(`${o.speed}×`);
  if (o.layout) chips.push(String(o.layout));
  if (o.captions) chips.push("captions");
  if (o.kenBurns === false) chips.push("no zoom");
  if (o.watermark) chips.push("watermark");
  return chips;
}

/** Every render of a video (or Short), newest first, with play / download / delete. */
export function RenderHistory({
  projectId,
  renders,
  vertical = false,
  hideCurrent = false,
}: {
  projectId: string;
  renders: RenderRow[];
  vertical?: boolean;
  hideCurrent?: boolean;
}) {
  const act = useProjectAction(projectId);
  const [playing, setPlaying] = useState<string | null>(null);
  const rows = hideCurrent ? renders.filter((r) => !r.current) : renders;
  if (!rows.length) return null;
  const total = renders.reduce((a, r) => a + (r.sizeBytes ?? 0), 0);

  return (
    <div>
      <ul className="divide-y divide-stone-200">
        {rows.map((r) => (
          <li key={r.id} className="py-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium tabular-nums">{fmtWhen(r.createdAt)}</span>
              {r.current ? <Badge tone="green">Current</Badge> : null}
              <span className="text-xs tabular-nums text-stone-500">
                {r.durationSec ? fmtTime(r.durationSec) : ""} · {fmtBytes(r.sizeBytes)}
              </span>
              {optionChips(r.options).map((c) => (
                <Badge key={c}>{c}</Badge>
              ))}
              <div className="ml-auto flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setPlaying(playing === r.id ? null : r.id)} icon={<Play className="size-3.5" />}>
                  {playing === r.id ? "Hide" : "Play"}
                </Button>
                {r.url ? (
                  <a href={`${r.url}?download=1`}>
                    <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />}>
                      MP4
                    </Button>
                  </a>
                ) : null}
                {r.srtUrl ? (
                  <a href={`${r.srtUrl}?download=1`}>
                    <Button size="sm" variant="ghost">SRT</Button>
                  </a>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-stone-400 hover:text-red-600"
                  aria-label="Delete render"
                  loading={act.isPending && act.variables?.renderId === r.id}
                  onClick={() => confirm("Delete this render file?") && act.mutate({ action: "deleteRender", renderId: r.id })}
                  icon={<Trash2 className="size-3.5" />}
                />
              </div>
            </div>
            {playing === r.id && r.url ? (
              <video src={r.url} controls autoPlay className={cn("mt-2 rounded-lg bg-black", vertical ? "mx-auto aspect-[9/16] max-h-[480px]" : "aspect-video w-full")} />
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-1 text-xs text-stone-500">
        {renders.length} render{renders.length === 1 ? "" : "s"} · {fmtBytes(total)} on disk
      </div>
      <ErrorNote error={act.error} />
    </div>
  );
}
