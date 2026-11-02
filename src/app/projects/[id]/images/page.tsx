"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, ImageIcon, Keyboard, Pencil, RefreshCw, Sparkles, Upload, UserRound } from "lucide-react";
import { lastJob, runningJob, useProject, useProjectAction, type ProjectData } from "@/lib/client";
import { onScreenFont, textColors } from "@/lib/channel";
import { handFont } from "@/remotion/shared";
import { outlineFor } from "@/lib/color";
import { JobBar, StaleBanner, StepFooter, StepHeader } from "@/components/step";
import { Badge, Button, Card, EmptyState, ErrorNote, Select, Spinner, Textarea, cn, fmtTime } from "@/components/ui";

type Quality = "low" | "medium" | "high";
const QUALITY_LABEL: Record<Quality, string> = { low: "Draft (low)", medium: "Final (medium)", high: "Final (high)" };

export default function ImagesPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useProject(id);
  const act = useProjectAction(id);
  const [quality, setQuality] = useState<Quality>("low");
  const [focus, setFocus] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const scenes = useMemo(() => data?.scenes ?? [], [data]);
  // Keyboard review: ←/→ move, A approve, R regenerate.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (!scenes.length) return;
      if (e.key === "ArrowRight") setFocus((f) => Math.min(scenes.length - 1, f + 1));
      else if (e.key === "ArrowLeft") setFocus((f) => Math.max(0, f - 1));
      else if (e.key.toLowerCase() === "a") {
        const s = scenes[focus];
        act.mutate({ action: "updateScene", sceneId: s.id, values: { approved: !s.approved } });
      } else if (e.key.toLowerCase() === "r") {
        const s = scenes[focus];
        if (s.needsImage) act.mutate({ action: "images", sceneIds: [s.id], quality });
      } else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scenes, focus, quality, act]);

  useEffect(() => {
    gridRef.current?.querySelector<HTMLElement>(`[data-idx="${focus}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focus]);

  if (!data) return <Spinner />;
  const running = runningJob(data, "images");
  const job = running ?? lastJob(data, "images");
  const imageScenes = scenes.filter((s) => s.needsImage);
  const missing = imageScenes.filter((s) => !s.imagePath).length;
  const approved = scenes.filter((s) => s.approved).length;
  const est = { low: 0.02, medium: 0.06, high: 0.25 }[quality];

  return (
    <div>
      <StepHeader
        title="Images"
        description={
          data.product
            ? "Generate cheap drafts first, then regenerate the keepers at final quality. Your product photos are sent with every image so the product stays exactly the same."
            : "Generate cheap drafts first, then regenerate the keepers at final quality. Your character reference is sent with every image so the character stays consistent."
        }
        actions={
          <span className="hidden items-center gap-1.5 text-xs text-stone-500 md:flex">
            <Keyboard className="size-3.5" /> ←/→ move · A approve · R regenerate
          </span>
        }
      />
      <StaleBanner data={data} step="images">
        Some scenes changed after images were approved. Changed scenes are un-approved; regenerate those.
      </StaleBanner>

      {!scenes.length ? (
        <EmptyState icon={<ImageIcon className="size-8" />} title="Plan scenes first" />
      ) : (
        <div className="space-y-4">
          <CharacterRefCard data={data} />

          <Card className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{imageScenes.length - missing}</span> of {imageScenes.length} images generated ·{" "}
              <span className="font-medium">{approved}</span> of {scenes.length} scenes approved
              <span className="text-stone-500"> · {scenes.length - imageScenes.length} text frames need no image</span>
            </div>
            <Select value={quality} onChange={(e) => setQuality(e.target.value as Quality)} className="w-44" aria-label="Quality">
              {(Object.keys(QUALITY_LABEL) as Quality[]).map((q) => (
                <option key={q} value={q}>
                  {QUALITY_LABEL[q]}
                </option>
              ))}
            </Select>
            {missing ? (
              <Button
                variant="primary"
                icon={<Sparkles className="size-4" />}
                loading={Boolean(running)}
                onClick={() => act.mutate({ action: "images", quality, onlyMissing: true })}
                title={`≈ $${(missing * est).toFixed(2)}`}
              >
                Generate {missing} missing
              </Button>
            ) : (
              <Button
                icon={<RefreshCw className="size-4" />}
                loading={Boolean(running)}
                onClick={() => {
                  const ids = imageScenes.filter((s) => !s.approved).map((s) => s.id);
                  if (ids.length) act.mutate({ action: "images", quality, sceneIds: ids });
                }}
                disabled={!imageScenes.some((s) => !s.approved)}
                title="Regenerate every scene that isn't approved yet"
              >
                Regenerate unapproved
              </Button>
            )}
          </Card>
          <JobBar job={job} />
          <ErrorNote error={act.error} />

          <div ref={gridRef} className={cn("grid gap-3 sm:grid-cols-2", data.channel.kind === "product_ad" ? "md:grid-cols-3 xl:grid-cols-5" : "xl:grid-cols-3")}>
            {scenes.map((s, i) => (
              <SceneCard key={s.id} data={data} scene={s} quality={quality} focused={focus === i} onFocus={() => setFocus(i)} idx={i} />
            ))}
          </div>
        </div>
      )}

      <StepFooter
        data={data}
        step="images"
        canApprove={scenes.length > 0 && missing === 0 && !running}
        hint={missing ? `${missing} scenes still need an image.` : "Approving marks all generated images as approved."}
      />
    </div>
  );
}

function CharacterRefCard({ data }: { data: ProjectData }) {
  if (data.product) {
    // Product ads: the uploaded photos are the reference, edited on the Brief & Script step.
    return (
      <Card className="flex items-center gap-4 p-3">
        <div className="flex shrink-0 gap-1.5">
          {data.product.imageUrls.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={u ?? ""} alt={`Product photo ${i + 1}`} className="size-16 rounded-lg bg-stone-100 object-contain ring-1 ring-stone-200" />
          ))}
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium">Product reference</div>
          <div className="text-stone-600">Sent with every image so the AI keeps your exact product and only changes the scene around it.</div>
        </div>
        <Link href={`/projects/${data.project.id}/script`}>
          <Button size="sm" variant="secondary">
            Change photos
          </Button>
        </Link>
      </Card>
    );
  }
  return (
    <Card className="flex items-center gap-4 p-3">
      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-stone-100 ring-1 ring-stone-200">
        {data.channel.characterRefUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.channel.characterRefUrl} alt="Character reference" className="size-full object-cover" />
        ) : (
          <UserRound className="size-6 text-stone-400" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-medium">Character reference</div>
        <div className="text-stone-600">
          {data.channel.characterRefUrl
            ? "Sent with every image to keep the character looking the same."
            : "None set. Images will work, but the character may drift between frames."}
        </div>
      </div>
      <Link href="/channel#character">
        <Button size="sm" variant="secondary">
          {data.channel.characterRefUrl ? "Change" : "Create one"}
        </Button>
      </Link>
    </Card>
  );
}

function SceneCard({
  data,
  scene,
  quality,
  focused,
  onFocus,
  idx,
}: {
  data: ProjectData;
  scene: ProjectData["scenes"][number];
  quality: Quality;
  focused: boolean;
  onFocus: () => void;
  idx: number;
}) {
  const qc = useQueryClient();
  const act = useProjectAction(data.project.id);
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(scene.description);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const narration = data.sentences
    .filter((s) => s.idx >= scene.fromSentence && s.idx <= scene.toSentence)
    .map((s) => s.text)
    .join(" ");
  const busy = scene.imageStatus === "queued" || scene.imageStatus === "generating";
  const colors = textColors(data.channel.profile);
  const font = handFont(onScreenFont(data.channel.profile));

  async function upload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    await fetch(`/api/projects/${data.project.id}/scenes/${scene.id}/upload`, { method: "POST", body: fd });
    setUploading(false);
    qc.invalidateQueries({ queryKey: ["project", data.project.id] });
  }

  return (
    <Card
      data-idx={idx}
      onClick={onFocus}
      className={cn("overflow-hidden transition-shadow", focused && "ring-2 ring-brand", scene.approved && !focused && "ring-emerald-400")}
    >
      <div className={cn("relative bg-stone-100", data.channel.kind === "product_ad" ? "aspect-[9/16]" : "aspect-video")}>
        {!scene.needsImage ? (
          <div className="grid size-full place-items-center p-6 text-center" style={{ background: colors.paper }}>
            <span className="text-3xl leading-tight" style={{ color: colors.text, fontFamily: font }}>
              {scene.onScreenText}
            </span>
          </div>
        ) : scene.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={scene.imageUrl} alt={scene.description} className={cn("size-full object-cover", busy && "opacity-40")} />
            {scene.onScreenText ? (
              <span
                className="absolute inset-x-0 top-3 text-center text-xl [paint-order:stroke_fill]"
                style={{ color: colors.text, fontFamily: font, WebkitTextStroke: `3px ${outlineFor(colors.text)}` }}
              >
                {scene.onScreenText}
              </span>
            ) : null}
          </>
        ) : (
          <div className="grid size-full place-items-center text-stone-400">
            {scene.imageStatus === "error" ? <AlertCircle className="size-7 text-red-400" /> : <ImageIcon className="size-7" />}
          </div>
        )}
        {busy ? (
          <div className="absolute inset-0 grid place-items-center">
            <span className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium shadow">
              <Spinner className="size-3.5" /> {scene.imageStatus === "queued" ? "Queued" : "Drawing…"}
            </span>
          </div>
        ) : null}
        <div className="absolute left-2 top-2 flex gap-1">
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">#{scene.idx + 1}</span>
          {scene.imageQuality && scene.needsImage ? (
            <span className="rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">{scene.imageQuality}</span>
          ) : null}
        </div>
        {scene.approved ? (
          <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-emerald-500 text-white shadow">
            <Check className="size-3.5" />
          </span>
        ) : null}
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-baseline gap-2 text-xs text-stone-500">
          <span className="tabular-nums">{fmtTime(scene.start)}</span>
          <span className="line-clamp-2 text-[13px] text-stone-700">{narration}</span>
        </div>
        {scene.imageError ? <div className="line-clamp-3 text-xs text-red-700">{scene.imageError}</div> : null}
        {editing ? (
          <div className="space-y-2">
            <Textarea rows={4} className="text-[13px]" value={desc} onChange={(e) => setDesc(e.target.value)} autoFocus />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={async () => {
                  await act.mutateAsync({ action: "updateScene", sceneId: scene.id, values: { description: desc } });
                  act.mutate({ action: "images", sceneIds: [scene.id], quality });
                  setEditing(false);
                }}
              >
                Save & regenerate
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant={scene.approved ? "secondary" : "primary"}
              disabled={scene.needsImage && !scene.imagePath}
              onClick={() => act.mutate({ action: "updateScene", sceneId: scene.id, values: { approved: !scene.approved } })}
              icon={<Check className="size-3.5" />}
            >
              {scene.approved ? "Approved" : "Approve"}
            </Button>
            {scene.needsImage ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => act.mutate({ action: "images", sceneIds: [scene.id], quality })}
                  icon={<RefreshCw className="size-3.5" />}
                  title={`Regenerate at ${QUALITY_LABEL[quality]}`}
                >
                  Redo
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)} icon={<Pencil className="size-3.5" />}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={uploading}
                  onClick={() => fileRef.current?.click()}
                  icon={<Upload className="size-3.5" />}
                  aria-label="Upload your own image"
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                />
              </>
            ) : (
              <Badge>text frame</Badge>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
