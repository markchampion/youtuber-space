"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronDown, Download, LayoutGrid, Merge, Scissors, Sparkles } from "lucide-react";
import { lastJob, runningJob, useProject, useProjectAction, type ProjectData } from "@/lib/client";
import { checkSceneCoverage } from "@/lib/sync";
import { pacingOf } from "@/lib/channel";
import { JobBar, StaleBanner, StepFooter, StepHeader } from "@/components/step";
import { Badge, Button, Card, EmptyState, ErrorNote, Input, Select, Spinner, Textarea, fmtTime, useSyncedState } from "@/components/ui";

export default function ScenesPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useProject(id);
  const act = useProjectAction(id);
  if (!data) return <Spinner />;

  const running = runningJob(data, "scenes");
  const job = running ?? lastJob(data, "scenes");
  const problems = data.scenes.length ? checkSceneCoverage(data.scenes, data.sentences.length) : [];
  const duration = data.project.audioDuration;
  const pace = pacingOf(data.channel.profile);
  const images = data.scenes.filter((s) => s.needsImage).length;
  // With camera cuts, the picture also changes at every sentence inside a scene.
  const pictureChanges = data.scenes.reduce((n, s) => n + (pace.cameraCuts && s.needsImage ? s.toSentence - s.fromSentence + 1 : 1), 0);
  const every = duration && pictureChanges ? duration / pictureChanges : null;

  return (
    <div>
      <StepHeader
        title="Scenes & image prompts"
        models={[{ label: "Scenes", model: data.models.scenes }]}
        description="Sentences are grouped into scenes, and each scene becomes one image that stays on screen while its sentences are spoken. The style prefix and suffix are added automatically, so only the scene itself is described here."
        actions={
          data.scenes.length ? (
            <a href={`/api/projects/${id}/export?type=prompts`}>
              <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />}>
                Prompts .txt
              </Button>
            </a>
          ) : null
        }
      />
      <StaleBanner data={data} step="scenes">
        The script changed since these scenes were planned. Re-plan them, or check that every sentence is still covered.
      </StaleBanner>

      {!data.sentences.length ? (
        <EmptyState icon={<LayoutGrid className="size-8" />} title="Approve the script first" />
      ) : (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1 text-sm">
              {data.scenes.length ? (
                <>
                  <span className="font-medium">{images} images</span> for {data.sentences.length} sentences
                  {every ? (
                    <span className={every > 6 ? "text-amber-700" : "text-stone-500"}>
                      {" "}
                      · picture changes every ~{every.toFixed(1)}s{pace.cameraCuts ? " (with camera cuts)" : ""}
                    </span>
                  ) : null}
                  <span className="text-stone-500"> · draft images ≈ ${(images * 0.02).toFixed(2)}</span>
                </>
              ) : (
                <>
                  {data.sentences.length} sentences are ready to plan.
                  {!data.project.audioPath ? <span className="text-stone-500"> You can plan now, but pacing is better once the voice exists.</span> : null}
                </>
              )}
            </div>
            <Button
              variant={data.scenes.length ? "secondary" : "primary"}
              icon={<Sparkles className="size-4" />}
              loading={Boolean(running)}
              onClick={() => {
                if (!data.scenes.length || confirm("Re-plan all scenes? Current scenes and their images will be replaced.")) {
                  act.mutate({ action: "planScenes" });
                }
              }}
            >
              {data.scenes.length ? "Re-plan scenes" : "Plan scenes"}
            </Button>
          </Card>
          <JobBar job={job} />
          <ErrorNote error={act.error} />
          {problems.length ? <ErrorNote error={`Coverage problem: ${problems.join("; ")}`} /> : null}

          <div className="space-y-3">
            {data.scenes.map((s) => (
              <SceneRow key={s.id} data={data} scene={s} />
            ))}
          </div>
        </div>
      )}

      <StepFooter
        data={data}
        step="scenes"
        canApprove={data.scenes.length > 0 && !problems.length && !running}
        hint="Check each description reads like a concrete drawing. On-screen text is added over the image by code, so it's always spelled right."
      />
    </div>
  );
}

function SceneRow({ data, scene }: { data: ProjectData; scene: ProjectData["scenes"][number] }) {
  const act = useProjectAction(data.project.id);
  const profile = data.channel.profile;
  const [desc, setDesc] = useSyncedState(scene.description);
  const [text, setText] = useSyncedState(scene.onScreenText ?? "");
  const [showPrompt, setShowPrompt] = useState(false);

  const sentences = useMemo(
    () => data.sentences.filter((s) => s.idx >= scene.fromSentence && s.idx <= scene.toSentence),
    [data.sentences, scene.fromSentence, scene.toSentence],
  );
  const end = data.sentences[scene.toSentence]?.end;
  const update = (values: Record<string, unknown>) => act.mutate({ action: "updateScene", sceneId: scene.id, values });
  const textOnly = !scene.needsImage;

  return (
    <Card className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-xs text-stone-500">
          <span className="font-semibold text-stone-800">#{scene.idx + 1}</span>
          <span className="tabular-nums">
            {fmtTime(scene.start)}–{fmtTime(end)}
          </span>
          {scene.start != null && end != null ? <span className="tabular-nums">· {(end - scene.start).toFixed(1)}s</span> : null}
          {scene.imagePath ? <Badge tone="green">has image</Badge> : null}
        </div>
        <div className="space-y-1">
          {sentences.map((s, i) => (
            <div key={s.id} className="group flex items-start gap-1.5 text-[14px] leading-6 text-stone-800">
              <span className="flex-1">{s.text}</span>
              {i > 0 ? (
                <button
                  title="Start a new scene at this sentence"
                  onClick={() => act.mutate({ action: "splitScene", sceneId: scene.id, atSentence: s.idx })}
                  className="mt-1 rounded p-0.5 text-stone-300 opacity-0 hover:bg-stone-100 hover:text-stone-700 group-hover:opacity-100 focus:opacity-100"
                >
                  <Scissors className="size-3.5" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {scene.idx > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 -ml-2"
            icon={<Merge className="size-3.5" />}
            onClick={() => act.mutate({ action: "mergeScene", sceneId: scene.id })}
          >
            Merge into previous
          </Button>
        ) : null}
      </div>

      <div className="min-w-0 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <Select value={scene.frameType} onChange={(e) => update({ frameType: e.target.value })} aria-label="Frame type" className="h-9 text-[13px]">
            {profile.visual.frameTypes.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Select>
          <Select value={scene.background} onChange={(e) => update({ background: e.target.value })} aria-label="Background" className="h-9 text-[13px]">
            {profile.visual.backgrounds.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </Select>
        </div>
        <Input
          className="h-9 text-[13px] font-medium uppercase"
          placeholder="On-screen text (optional), e.g. 300,000 YEARS"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== (scene.onScreenText ?? "") && update({ onScreenText: text.trim() || null })}
        />
        {textOnly ? (
          <p className="rounded-lg bg-stone-50 px-3 py-2 text-[13px] text-stone-600">
            Text frame: drawn by code in the channel&apos;s text color. No image is generated.
          </p>
        ) : (
          <Textarea
            rows={3}
            className="text-[13px]"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => desc !== scene.description && update({ description: desc })}
            aria-label="Scene description"
          />
        )}
        {!textOnly ? (
          <button onClick={() => setShowPrompt(!showPrompt)} className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800">
            <ChevronDown className={`size-3.5 transition-transform ${showPrompt ? "rotate-180" : ""}`} /> Full image prompt
          </button>
        ) : null}
        {showPrompt ? <p className="rounded-lg bg-stone-50 p-2.5 font-mono text-[11px] leading-relaxed text-stone-600">{scene.prompt}</p> : null}
      </div>
    </Card>
  );
}
