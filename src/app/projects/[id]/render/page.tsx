"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Player, type PlayerRef } from "@remotion/player";
import { Clapperboard, Download, Film, Minus, Plus } from "lucide-react";
import { api, lastJob, runningJob, useProject, useProjectAction } from "@/lib/client";
import { DoodleVideo } from "@/remotion/DoodleVideo";
import { ProductAd } from "@/remotion/ProductAd";
import { handFont } from "@/remotion/shared";
import type { AdProps, VideoProps } from "@/remotion/types";
import { JobBar, StaleBanner, StepFooter, StepHeader } from "@/components/step";
import { RenderHistory } from "@/components/render-history";
import { Button, Card, EmptyState, ErrorNote, Spinner, cn, fmtTime, useSyncedState } from "@/components/ui";

/** Current Player frame. Kept in leaf components so playback doesn't re-render the whole page every frame. */
function usePlayerFrame(player: RefObject<PlayerRef | null>, vp: unknown) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    p.addEventListener("frameupdate", onFrame);
    return () => p.removeEventListener("frameupdate", onFrame);
  }, [player, vp]);
  return frame;
}

function NowPlaying({ player, vp, sentences }: { player: RefObject<PlayerRef | null>; vp: VideoProps | AdProps | undefined; sentences: { start: number | null; text: string }[] }) {
  const frame = usePlayerFrame(player, vp);
  const t = vp ? frame / vp.fps : 0;
  let current = null;
  for (const x of sentences) if ((x.start ?? Infinity) <= t) current = x;
  return (
    <div className="min-h-12 border-t border-stone-200 px-4 py-2.5 text-[14px] text-stone-700">
      <span className="mr-2 tabular-nums text-xs text-stone-400">{fmtTime(t)}</span>
      {current?.text}
    </div>
  );
}

function Playhead({ player, vp }: { player: RefObject<PlayerRef | null>; vp: VideoProps | AdProps }) {
  const frame = usePlayerFrame(player, vp);
  return <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-stone-900" style={{ left: `${(frame / vp.durationInFrames) * 100}%` }} />;
}

export default function RenderPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useProject(id);
  const act = useProjectAction(id);
  const ad = data?.channel.kind === "product_ad";
  // Silent ads have no voice to speed up: lines follow reading pace.
  const silent = data?.project.voiceMode === "none";
  // Captions are part of the ad format; long videos default to off (YouTube has its own).
  const [captions, setCaptions] = useSyncedState(ad);
  const [kenBurns, setKenBurns] = useState(true);
  const [lead, setLead] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const player = useRef<PlayerRef>(null);

  const version = data?.project.updatedAt + ":" + data?.scenes.map((s) => `${s.imagePath}${s.nudgeMs}${s.onScreenText}`).join("|");
  const props = useQuery({
    queryKey: ["videoProps", id, captions, kenBurns, version],
    queryFn: () => api<{ props: VideoProps | AdProps }>(`/api/projects/${id}`, { json: { action: "videoProps", showCaptions: captions, kenBurns } }),
    enabled: Boolean((data?.project.voiceMode === "none" ? data?.project.audioDuration : data?.project.audioPath) && data?.scenes.length),
    placeholderData: (prev) => prev,
  });
  const vp = props.data?.props;

  if (!data) return <Spinner />;
  const running = runningJob(data, "render");
  const job = running ?? lastJob(data, "render");
  const ready = Boolean((silent ? data.project.audioDuration : data.project.audioPath) && data.scenes.length);
  const missingImages = data.scenes.filter((s) => s.needsImage && !s.imagePath).length;
  const leadMs = lead ?? data.project.visualLeadMs;
  const rate = speed ?? data.project.playbackRate;
  const baseDuration = data.project.audioDuration ?? 0;
  const sel = vp?.scenes.find((s) => s.id === selected);
  const selScene = data.scenes.find((s) => s.id === selected);

  return (
    <div>
      <StepHeader
        title="Preview & render"
        description="This preview uses the same code as the final render, so what you see here is what you get. Images switch exactly on sentence starts from the voice timings."
      />
      <StaleBanner data={data} step="render">
        Voice, scenes or images changed since the last approved render. Re-render to include the changes.
      </StaleBanner>

      {!ready ? (
        <EmptyState icon={<Film className="size-8" />} title={silent ? "Needs an approved script and scenes" : "Needs voice and scenes"}>
          {silent ? "Approve the script and plan scenes first." : "Generate the voice and plan scenes first."} Images can still be missing; they show as placeholders.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <div className={cn("grid gap-4", ad ? "md:grid-cols-[minmax(0,420px)_300px]" : "xl:grid-cols-[minmax(0,1fr)_300px]")}>
            <Card className="overflow-hidden">
              {vp && ad && "endCard" in vp ? (
                <Player
                  ref={player}
                  component={ProductAd}
                  inputProps={vp}
                  durationInFrames={vp.durationInFrames}
                  fps={vp.fps}
                  compositionWidth={vp.width}
                  compositionHeight={vp.height}
                  style={{ width: "100%", aspectRatio: "9 / 16" }}
                  controls
                  acknowledgeRemotionLicense
                />
              ) : vp ? (
                <Player
                  ref={player}
                  component={DoodleVideo}
                  inputProps={vp}
                  durationInFrames={vp.durationInFrames}
                  fps={vp.fps}
                  compositionWidth={vp.width}
                  compositionHeight={vp.height}
                  style={{ width: "100%", aspectRatio: "16 / 9" }}
                  controls
                  acknowledgeRemotionLicense
                />
              ) : (
                <div className={cn("grid place-items-center", ad ? "aspect-[9/16]" : "aspect-video")}>
                  <Spinner />
                </div>
              )}
              <NowPlaying player={player} vp={vp} sentences={data.sentences} />
            </Card>

            <Card className="space-y-4 p-4">
              <div className="font-medium">Options</div>
              <label className="flex items-center justify-between gap-2 text-sm">
                {silent ? "On-screen text (the script lines)" : "Burned-in captions"}
                <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} className="size-4 accent-orange-500" />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm">
                Slow zoom (Ken Burns)
                <input type="checkbox" checked={kenBurns} onChange={(e) => setKenBurns(e.target.checked)} className="size-4 accent-orange-500" />
              </label>
              {silent ? null : (
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <label htmlFor="speed">Speed</label>
                  <span className="tabular-nums text-stone-500">
                    {rate.toFixed(2)}× · {fmtTime(baseDuration / rate)}
                  </span>
                </div>
                <input
                  id="speed"
                  type="range"
                  min={0.8}
                  max={1.3}
                  step={0.05}
                  value={rate}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  onPointerUp={() => act.mutate({ action: "setTiming", playbackRate: rate }, { onSuccess: () => setSpeed(null) })}
                  onKeyUp={() => act.mutate({ action: "setTiming", playbackRate: rate }, { onSuccess: () => setSpeed(null) })}
                  className="w-full"
                />
                <div className="flex justify-between text-[11px] text-stone-400">
                  <span>0.8× slower</span>
                  <button className="hover:text-stone-700" onClick={() => act.mutate({ action: "setTiming", playbackRate: 1 })}>
                    reset 1×
                  </button>
                  <span>1.3× faster</span>
                </div>
                <p className="mt-1 text-[11px] text-stone-500">
                  Speeds up voice, image cuts and captions together, with the voice pitch kept natural. Free, with no re-voicing. Most channels sit at 1.0–1.15×.
                </p>
                {ad && baseDuration / rate > 20 ? (
                  <p className="mt-1 text-[11px] font-medium text-amber-800">
                    The voice runs {Math.round(baseDuration / rate)} s (plus a 2.5 s end card). Ads work best at 15–20 s: speed it up or shorten the script.
                  </p>
                ) : null}
              </div>
              )}
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span>Visual lead</span>
                  <span className="tabular-nums text-stone-500">{leadMs} ms</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={500}
                  step={25}
                  value={leadMs}
                  onChange={(e) => setLead(Number(e.target.value))}
                  onPointerUp={() => act.mutate({ action: "setTiming", visualLeadMs: leadMs }, { onSuccess: () => setLead(null) })}
                  className="w-full"
                  aria-label="Visual lead in milliseconds"
                />
                <p className="text-[11px] text-stone-500">Images appear this long before their first word. Around 150 ms feels natural.</p>
              </div>
              {missingImages ? <p className="text-xs text-amber-700">{missingImages} scenes have no image yet and will render as placeholders.</p> : null}
              <Button
                variant="primary"
                className="w-full"
                icon={<Clapperboard className="size-4" />}
                loading={Boolean(running)}
                onClick={() => act.mutate({ action: "render", showCaptions: captions, kenBurns })}
              >
                {data.renderUrl ? "Re-render MP4" : "Render MP4"}
              </Button>
              <JobBar job={job} />
              <ErrorNote error={act.error} />
              {data.renderUrl && !running ? (
                <div className="flex gap-2">
                  <a href={`${data.renderUrl}?download=1`} className="flex-1">
                    <Button className="w-full" icon={<Download className="size-4" />}>
                      MP4
                    </Button>
                  </a>
                  <a href={`/api/projects/${id}/export?type=srt`}>
                    <Button icon={<Download className="size-4" />}>SRT</Button>
                  </a>
                </div>
              ) : null}
            </Card>
          </div>

          {/* Timeline strip */}
          {vp ? (
            <Card className="p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-stone-500">
                <span>Timeline: click a scene to jump, then nudge its start if a cut feels early or late</span>
                <span className="tabular-nums">{fmtTime(vp.durationInFrames / vp.fps)}</span>
              </div>
              <div className="relative flex h-16 w-full overflow-hidden rounded-md ring-1 ring-stone-200">
                {vp.scenes.map((s, i) => (
                  <button
                    key={s.id}
                    title={`#${i + 1} at ${fmtTime(s.fromFrame / vp.fps)}`}
                    onClick={() => {
                      setSelected(s.id);
                      // Land just after the crossfade so the scene is fully visible.
                      player.current?.seekTo(Math.min(s.fromFrame + vp.crossfadeFrames, s.fromFrame + s.durationInFrames - 1));
                    }}
                    className={cn("relative h-full shrink-0 overflow-hidden border-r border-white/70", selected === s.id && "outline-2 -outline-offset-2 outline-brand")}
                    style={{ width: `${(s.durationInFrames / vp.durationInFrames) * 100}%`, background: s.textOnly ? vp.paperColor : s.bgColor }}
                  >
                    {s.imageUrl && !s.textOnly ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.imageUrl} alt="" className="size-full object-cover" />
                    ) : s.textOnly ? (
                      <span className="block truncate px-1 text-[10px]" style={{ color: vp.textColor, fontFamily: handFont(vp.fontKey) }}>
                        {s.onScreenText}
                      </span>
                    ) : null}
                  </button>
                ))}
                <Playhead player={player} vp={vp} />
              </div>
              {sel && selScene ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium">Scene #{selScene.idx + 1}</span>
                  <span className="tabular-nums text-stone-500">starts {fmtTime(sel.fromFrame / vp.fps)}</span>
                  {selScene.idx > 0 ? (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label="Start 100 ms earlier"
                        onClick={() => act.mutate({ action: "updateScene", sceneId: selScene.id, values: { nudgeMs: selScene.nudgeMs - 100 } })}
                        icon={<Minus className="size-3.5" />}
                      />
                      <span className="w-20 text-center tabular-nums">
                        {selScene.nudgeMs > 0 ? "+" : ""}
                        {selScene.nudgeMs} ms
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label="Start 100 ms later"
                        onClick={() => act.mutate({ action: "updateScene", sceneId: selScene.id, values: { nudgeMs: selScene.nudgeMs + 100 } })}
                        icon={<Plus className="size-3.5" />}
                      />
                      {selScene.nudgeMs ? (
                        <Button size="sm" variant="ghost" onClick={() => act.mutate({ action: "updateScene", sceneId: selScene.id, values: { nudgeMs: 0 } })}>
                          Reset
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-xs text-stone-500">The first scene always starts at 0:00</span>
                  )}
                </div>
              ) : null}
            </Card>
          ) : null}

          {data.renderUrl && !running ? (
            <Card className="overflow-hidden">
              <div className="border-b border-stone-200 px-4 py-2.5 text-sm font-medium">Current render</div>
              <video src={data.renderUrl} controls className={cn("w-full bg-black", ad ? "mx-auto aspect-[9/16] max-w-[420px]" : "aspect-video")} />
            </Card>
          ) : null}
          {data.renders.length ? (
            <Card className="p-4">
              <div className="mb-1 text-sm font-medium">Render history</div>
              <p className="mb-2 text-xs text-stone-500">Every render is kept until you delete it. The newest is the current one.</p>
              <RenderHistory projectId={id} renders={data.renders} />
            </Card>
          ) : null}
        </div>
      )}

      <StepFooter data={data} step="render" canApprove={Boolean(data.renderUrl) && !running} hint={
          data.renderUrl
            ? ad
              ? "Happy with the ad? Mark it done and download the MP4."
              : "Happy with the render? Approve it and move on to metadata."
            : "Render the MP4 to finish this step."
        } />
    </div>
  );
}
