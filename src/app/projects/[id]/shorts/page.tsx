"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Player } from "@remotion/player";
import { Clapperboard, Download, ImagePlus, ListOrdered, Plus, Smartphone, Sparkles, Trash2 } from "lucide-react";
import { api, useProject, useProjectAction, type ProjectData } from "@/lib/client";
import { DoodleShort } from "@/remotion/DoodleShort";
import { SHORT_MAX_SECONDS, seriesSplit } from "@/lib/sync";
import type { ShortProps } from "@/remotion/types";
import { JobBar, StaleBanner, StepFooter, StepHeader } from "@/components/step";
import { RenderHistory } from "@/components/render-history";
import { Badge, Button, Card, CopyButton, EmptyState, ErrorNote, Input, Label, Select, Spinner, Textarea, cn, fmtTime, useInView, useSyncedState } from "@/components/ui";

type ShortRow = ProjectData["shorts"][number];

export default function ShortsPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useProject(id);
  const act = useProjectAction(id);
  const [seriesOpen, setSeriesOpen] = useState(false);
  if (!data) return <Spinner />;

  const hasVoice = Boolean(data.project.audioPath);
  const suggesting = act.isPending && act.variables?.action === "suggestShorts";

  return (
    <div>
      <StepHeader
        title="Shorts"
        description="Vertical 9:16 clips for YouTube Shorts, TikTok and Reels, cut from this video. They reuse its narration and images, so they cost almost nothing."
        models={[{ label: "Clip picking", model: data.models.shorts }]}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!hasVoice}
              onClick={() => act.mutate({ action: "createShort", fromSentence: 0 })}
              icon={<Plus className="size-4" />}
            >
              New Short
            </Button>
            <Button
              variant="secondary"
              disabled={!hasVoice}
              onClick={() => setSeriesOpen(!seriesOpen)}
              icon={<ListOrdered className="size-4" />}
              title="Consecutive parts that follow each other: Part 1, Part 2, …"
            >
              Make a series
            </Button>
            <Button
              variant="primary"
              disabled={!hasVoice}
              loading={suggesting}
              onClick={() => act.mutate({ action: "suggestShorts", count: 3 })}
              icon={<Sparkles className="size-4" />}
            >
              Suggest Shorts
            </Button>
          </>
        }
      />
      <StaleBanner data={data} step="shorts">
        The voice or images changed. Re-render your Shorts so they match.
      </StaleBanner>
      <ErrorNote error={act.error} />
      {seriesOpen && hasVoice ? <SeriesForm data={data} onDone={() => setSeriesOpen(false)} /> : null}

      {!hasVoice ? (
        <EmptyState icon={<Smartphone className="size-8" />} title="Generate the voice first">
          Shorts are cut from this video&apos;s narration, so they need the voice step done.
        </EmptyState>
      ) : !data.shorts.length ? (
        <EmptyState icon={<Smartphone className="size-8" />} title="No Shorts yet">
          <b>Suggest Shorts</b> picks the 3 best stand-alone 30–60 s moments and writes a hook title, caption and hashtags for each. <b>Make a series</b> cuts the
          whole video into consecutive parts (Part 1, Part 2, …). Or use <b>New Short</b> and pick the sentences yourself.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {data.shorts.map((s) => (
            <ShortCard key={s.id} data={data} short={s} />
          ))}
        </div>
      )}

      <StepFooter data={data} step="shorts" canApprove hint="Optional. Render the Shorts you want, then upload each to Shorts, TikTok and Reels." />
    </div>
  );
}

const PART_LENGTHS = [30, 45, 60, 90, 120, 180];
const SPEEDS = [1, 1.1, 1.15, 1.2, 1.25, 1.3];

function SpeedSelect({ value, videoSpeed, onChange, className }: { value: number | null; videoSpeed: number; onChange: (v: number | null) => void; className?: string }) {
  return (
    <Select aria-label="Speed" className={className} value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">Same as video ({videoSpeed}×)</option>
      {SPEEDS.map((r) => (
        <option key={r} value={r}>
          {r}×
        </option>
      ))}
    </Select>
  );
}

/** Choose part length, number of parts and speed; shows how the video would be cut before creating anything. */
function SeriesForm({ data, onDone }: { data: ProjectData; onDone: () => void }) {
  const act = useProjectAction(data.project.id);
  const [partSeconds, setPartSeconds] = useState(60);
  const [maxParts, setMaxParts] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const videoSpeed = data.project.playbackRate || 1;
  const rate = speed ?? videoSpeed;
  const parts = useMemo(() => {
    const sents = data.sentences.filter((s) => s.start != null && s.end != null);
    if (sents.length !== data.sentences.length) return [];
    return seriesSplit(
      sents.map((s) => ({ start: s.start!, end: s.end!, paragraphIdx: s.paragraphIdx, text: s.text })),
      { partSeconds: partSeconds * rate, maxParts, maxSeconds: SHORT_MAX_SECONDS * rate },
    ).map((p) => (data.sentences[p.toSentence].end! - data.sentences[p.fromSentence].start!) / rate);
  }, [data.sentences, partSeconds, maxParts, rate]);
  const creating = act.isPending;
  const range = parts.length ? `${Math.round(Math.min(...parts))}–${Math.round(Math.max(...parts))} s each` : "";

  return (
    <Card className="mb-4 space-y-3 p-4">
      <div>
        <div className="font-medium">Make a series</div>
        <p className="text-[13px] text-stone-600">
          Cuts the video into consecutive parts in story order. Each part shows &quot;PART 2/10&quot; at the top and &quot;Part 3 next →&quot; at the end; the last
          one points to the full video. Cuts land on sentence and paragraph ends.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Part length</Label>
          <Select className="w-32" value={partSeconds} onChange={(e) => setPartSeconds(Number(e.target.value))}>
            {PART_LENGTHS.map((n) => (
              <option key={n} value={n}>
                {n < 120 ? `${n} s` : `${n / 60} min`}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Parts</Label>
          <Select className="w-40" value={maxParts ?? ""} onChange={(e) => setMaxParts(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Whole video</option>
            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
              <option key={n} value={n}>
                First {n}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Speed</Label>
          <SpeedSelect className="w-48" value={speed} videoSpeed={videoSpeed} onChange={setSpeed} />
        </div>
        <div className="pb-2 text-sm text-stone-600">
          {parts.length ? (
            <>
              ≈ <b>{parts.length}</b> part{parts.length === 1 ? "" : "s"}, {range}
            </>
          ) : (
            "Voice timings missing"
          )}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={creating}
            disabled={!parts.length}
            onClick={() => act.mutate({ action: "createSeries", partSeconds, maxParts, speed }, { onSuccess: onDone })}
            icon={<ListOrdered className="size-4" />}
          >
            Create {parts.length || ""} parts
          </Button>
        </div>
      </div>
      <ErrorNote error={act.error} />
    </Card>
  );
}

function ShortCard({ data, short }: { data: ProjectData; short: ShortRow }) {
  const projectId = data.project.id;
  const act = useProjectAction(projectId);
  const [title, setTitle] = useSyncedState(short.title);
  const [caption, setCaption] = useSyncedState(short.caption ?? "");
  const [hashtags, setHashtags] = useSyncedState(short.hashtags ?? "");
  const job = data.jobs.find((j) => j.type === `short:${short.id}`);
  const running = job?.status === "running";
  const update = (values: Record<string, unknown>) => act.mutate({ action: "updateShort", shortId: short.id, values });

  const version = [data.project.updatedAt, short.title, short.fromSentence, short.toSentence, short.layout, short.verticalDone, short.playbackRate, short.part].join("|");
  const props = useQuery({
    queryKey: ["shortProps", short.id, version],
    queryFn: () => api<{ props: ShortProps }>(`/api/projects/${projectId}`, { json: { action: "shortProps", shortId: short.id } }),
    placeholderData: (prev) => prev,
  });
  const vp = props.data?.props;
  // Every short has its own Player; only mount the ones near the screen so they don't all load at once.
  const [previewRef, inView] = useInView<HTMLDivElement>();
  const poster = vp?.scenes.find((s) => s.verticalImageUrl ?? s.imageUrl);

  const d = short.duration ?? 0;
  const durationTone = d < 15 ? "amber" : d <= 60 ? "green" : d <= 180 ? "neutral" : "red";
  const sentenceLabel = (i: number) => {
    const s = data.sentences[i];
    return `${fmtTime(s?.start)} · ${s?.text.slice(0, 60)}${(s?.text.length ?? 0) > 60 ? "…" : ""}`;
  };
  const missingVertical = short.verticalNeeded - short.verticalDone;

  return (
    <Card className="grid gap-5 p-4 md:grid-cols-[260px_minmax(0,1fr)]">
      {/* Phone-shaped preview */}
      <div className="mx-auto w-[260px]">
        <div className="overflow-hidden rounded-[28px] bg-black p-1.5 shadow-md ring-1 ring-stone-300">
          <div ref={previewRef} className="overflow-hidden rounded-[22px]">
            {vp && !inView ? (
              <div className="aspect-[9/16] bg-stone-100">
                {poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={poster.verticalImageUrl ?? poster.imageUrl ?? ""} alt="" className="size-full object-cover" />
                ) : null}
              </div>
            ) : vp ? (
              <Player
                component={DoodleShort}
                inputProps={vp}
                durationInFrames={vp.durationInFrames}
                fps={vp.fps}
                compositionWidth={vp.width}
                compositionHeight={vp.height}
                style={{ width: "100%", aspectRatio: "9 / 16" }}
                controls
                acknowledgeRemotionLicense
              />
            ) : (
              <div className="grid aspect-[9/16] place-items-center bg-stone-100">
                {props.error ? <span className="p-4 text-center text-xs text-red-700">{String(props.error)}</span> : <Spinner />}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <Label hint={short.part && short.partsTotal ? <Badge tone="brand">Part {short.part}/{short.partsTotal}</Badge> : undefined}>Hook title (on screen)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== short.title && update({ title: title.trim() })}
              className="font-medium"
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-6 text-stone-400 hover:text-red-600"
            aria-label="Delete Short"
            onClick={() => confirm("Delete this Short?") && act.mutate({ action: "deleteShort", shortId: short.id })}
            icon={<Trash2 className="size-4" />}
          />
        </div>
        {short.reason ? <p className="text-[13px] italic text-stone-500">{short.reason}</p> : null}

        <div>
          <Label hint={<Badge tone={durationTone}>{d.toFixed(0)} s{short.speed !== 1 ? ` at ${short.speed}×` : ""}{" "}
                {d > 180 ? "· over the 3-min Shorts limit" : d > 60 ? "· fine for YouTube Shorts; TikTok/Reels prefer shorter" : d < 15 ? "· very short" : ""}</Badge>}>Clip</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              aria-label="First sentence"
              className="h-9 text-[13px]"
              value={short.fromSentence}
              onChange={(e) => {
                const from = Number(e.target.value);
                update({ fromSentence: from, toSentence: Math.max(from, short.toSentence) });
              }}
            >
              {data.sentences.map((s, i) => (
                <option key={s.id} value={i}>
                  From {sentenceLabel(i)}
                </option>
              ))}
            </Select>
            <Select aria-label="Last sentence" className="h-9 text-[13px]" value={short.toSentence} onChange={(e) => update({ toSentence: Number(e.target.value) })}>
              {data.sentences.map((s, i) =>
                i >= short.fromSentence ? (
                  <option key={s.id} value={i}>
                    To {sentenceLabel(i)}
                  </option>
                ) : null,
              )}
            </Select>
          </div>
        </div>

        <div>
          <Label hint="voice pitch stays natural">Speed</Label>
          <SpeedSelect
            className="h-9 w-52 text-[13px]"
            value={short.playbackRate}
            videoSpeed={data.project.playbackRate || 1}
            onChange={(v) => update({ playbackRate: v })}
          />
        </div>

        <div>
          <Label>Layout</Label>
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Layout" className="inline-flex rounded-lg bg-stone-200/70 p-1">
              {(["stacked", "fullscreen"] as const).map((l) => {
                const disabled = l === "fullscreen" && missingVertical > 0;
                return (
                  <button
                    key={l}
                    role="radio"
                    aria-checked={short.layout === l}
                    aria-label={l === "stacked" ? "Stacked layout" : "Full-screen layout"}
                    disabled={disabled}
                    title={disabled ? "Draw the vertical images first" : undefined}
                    onClick={() => short.layout !== l && update({ layout: l })}
                    className={cn(
                      "h-8 rounded-md px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
                      short.layout === l ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900",
                    )}
                  >
                    {l === "stacked" ? "Stacked (free)" : "Full-screen"}
                  </button>
                );
              })}
            </div>
            {missingVertical > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={running}
                onClick={() => act.mutate({ action: "verticalImages", shortId: short.id, quality: "low" })}
                icon={<ImagePlus className="size-3.5" />}
                title="Draft quality. The long video's images are not changed."
              >
                Draw {missingVertical} vertical image{missingVertical === 1 ? "" : "s"} (≈ ${(missingVertical * 0.02).toFixed(2)})
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <div>
            <Label hint={<CopyButton text={`${caption}\n\n${hashtags}`.trim()} label="Copy caption + tags" />}>Post caption</Label>
            <Textarea rows={2} className="text-[13px]" value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={() => caption !== (short.caption ?? "") && update({ caption })} />
            <Input
              className="mt-2 h-9 text-[13px]"
              value={hashtags}
              placeholder="#hashtags"
              onChange={(e) => setHashtags(e.target.value)}
              onBlur={() => hashtags !== (short.hashtags ?? "") && update({ hashtags })}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 pt-3">
          <Button
            variant={short.renderUrl ? "secondary" : "primary"}
            loading={running}
            onClick={() => act.mutate({ action: "renderShort", shortId: short.id })}
            icon={<Clapperboard className="size-4" />}
          >
            {short.renderUrl ? "Re-render" : "Render Short"}
          </Button>
          {short.renderUrl && !running ? (
            <a href={`${short.renderUrl}?download=1`}>
              <Button icon={<Download className="size-4" />}>MP4 (1080×1920)</Button>
            </a>
          ) : null}
          <span className="text-xs text-stone-500">Upload to YouTube Shorts, TikTok, Instagram and Facebook Reels</span>
        </div>
        <JobBar job={job} />
        <ErrorNote error={act.error} />
        {(data.shortRenders[short.id] ?? []).some((r) => !r.current) ? (
          <details className="rounded-lg bg-stone-50 px-3 py-2 ring-1 ring-stone-200">
            <summary className="cursor-pointer text-[13px] font-medium text-stone-700">
              Earlier renders ({(data.shortRenders[short.id] ?? []).filter((r) => !r.current).length})
            </summary>
            <div className="mt-1">
              <RenderHistory projectId={projectId} renders={data.shortRenders[short.id] ?? []} vertical hideCurrent />
            </div>
          </details>
        ) : null}
      </div>
    </Card>
  );
}
