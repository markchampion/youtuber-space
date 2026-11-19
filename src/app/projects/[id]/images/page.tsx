"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { useT } from "@/lib/i18n";

type Quality = "low" | "medium" | "high";
const QUALITIES: Quality[] = ["low", "medium", "high"];

/** Fills `{name}` slots of a translated sentence with React nodes (e.g. bold numbers). */
function rich(text: string, parts: Record<string, ReactNode>): ReactNode {
  return text.split(/\{(\w+)\}/).map((s, i) => (i % 2 ? <Fragment key={i}>{parts[s] ?? `{${s}}`}</Fragment> : s));
}

export default function ImagesPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useProject(id);
  const act = useProjectAction(id);
  const t = useT();
  const [quality, setQuality] = useState<Quality>("low");
  const [focus, setFocus] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const scenes = useMemo(() => data?.scenes ?? [], [data]);
  // Keyboard review: ←/→ move, A approve, R regenerate.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
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
        title={t("common.steps.images")}
        description={
          data.product
            ? t("media.images.descriptionProduct")
            : t("media.images.descriptionCharacter")
        }
        actions={
          <span className="hidden items-center gap-1.5 text-xs text-stone-500 md:flex">
            <Keyboard className="size-3.5" /> {t("media.images.keyboard")}
          </span>
        }
      />
      <StaleBanner data={data} step="images">
        {t("media.images.stale")}
      </StaleBanner>

      {!scenes.length ? (
        <EmptyState icon={<ImageIcon className="size-8" />} title={t("media.images.planScenesFirst")} />
      ) : (
        <div className="space-y-4">
          <CharacterRefCard data={data} />

          <Card className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1 text-sm">
              {rich(t("media.images.generated", { total: imageScenes.length }), { done: <span className="font-medium">{imageScenes.length - missing}</span> })} ·{" "}
              {rich(t("media.images.approvedCount", { total: scenes.length }), { approved: <span className="font-medium">{approved}</span> })}
              <span className="text-stone-500"> · {t("media.images.textFrames", { count: scenes.length - imageScenes.length })}</span>
            </div>
            <Select value={quality} onChange={(e) => setQuality(e.target.value as Quality)} className="w-44" aria-label={t("media.images.qualityLabel")}>
              {QUALITIES.map((q) => (
                <option key={q} value={q}>
                  {t(`media.images.quality.${q}`)}
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
                {t("media.images.generateMissing", { count: missing })}
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
                title={t("media.images.regenerateUnapprovedTitle")}
              >
                {t("media.images.regenerateUnapproved")}
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
        hint={missing ? t("media.images.hintMissing", { count: missing }) : t("media.images.hintApprove")}
      />
    </div>
  );
}

function CharacterRefCard({ data }: { data: ProjectData }) {
  const t = useT();
  if (data.product) {
    // Product ads: the uploaded photos are the reference, edited on the Brief & Script step.
    return (
      <Card className="flex items-center gap-4 p-3">
        <div className="flex shrink-0 gap-1.5">
          {data.product.imageUrls.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={u ?? ""} alt={t("media.images.productPhotoAlt", { n: i + 1 })} className="size-16 rounded-lg bg-stone-100 object-contain ring-1 ring-stone-200" />
          ))}
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium">{t("media.images.productReference")}</div>
          <div className="text-stone-600">{t("media.images.productReferenceHelp")}</div>
        </div>
        <Link href={`/projects/${data.project.id}/script`}>
          <Button size="sm" variant="secondary">
            {t("media.images.changePhotos")}
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
          <img src={data.channel.characterRefUrl} alt={t("media.images.characterReference")} className="size-full object-cover" />
        ) : (
          <UserRound className="size-6 text-stone-400" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-medium">{t("media.images.characterReference")}</div>
        <div className="text-stone-600">
          {data.channel.characterRefUrl
            ? t("media.images.characterSet")
            : t("media.images.characterNone")}
        </div>
      </div>
      <Link href="/channel#character">
        <Button size="sm" variant="secondary">
          {data.channel.characterRefUrl ? t("media.images.change") : t("media.images.createOne")}
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
  const t = useT();
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
              <Spinner className="size-3.5" /> {scene.imageStatus === "queued" ? t("media.images.queued") : t("media.images.drawing")}
            </span>
          </div>
        ) : null}
        <div className="absolute left-2 top-2 flex gap-1">
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">#{scene.idx + 1}</span>
          {scene.imageQuality && scene.needsImage ? (
            <span className="rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">{t.dyn(`media.images.qualityShort.${scene.imageQuality}`, scene.imageQuality)}</span>
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
                {t("media.images.saveRegenerate")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {t("common.cancel")}
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
              {scene.approved ? t("media.images.approved") : t("media.images.approve")}
            </Button>
            {scene.needsImage ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => act.mutate({ action: "images", sceneIds: [scene.id], quality })}
                  icon={<RefreshCw className="size-3.5" />}
                  title={t("media.images.redoTitle", { quality: t(`media.images.quality.${quality}`) })}
                >
                  {t("media.images.redo")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)} icon={<Pencil className="size-3.5" />}>
                  {t("common.edit")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={uploading}
                  onClick={() => fileRef.current?.click()}
                  icon={<Upload className="size-3.5" />}
                  aria-label={t("media.images.uploadOwn")}
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
              <Badge>{t("media.images.textFrame")}</Badge>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
