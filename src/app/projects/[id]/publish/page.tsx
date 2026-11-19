"use client";

import { useParams } from "next/navigation";
import { Download, ImagePlus, Megaphone, Sparkles } from "lucide-react";
import { useProject, useProjectAction } from "@/lib/client";
import { StaleBanner, StepFooter, StepHeader } from "@/components/step";
import { Badge, Button, Card, CopyButton, EmptyState, ErrorNote, Spinner } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function PublishPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useProject(id);
  const act = useProjectAction(id);
  const t = useT();
  if (!data) return <Spinner />;
  const m = data.project.metadata;
  const thumbBusy = act.isPending && act.variables?.action === "thumbnail" ? String(act.variables.concept) : null;

  return (
    <div>
      <StepHeader
        title={t("common.steps.publish")}
        description={t("media.publish.description")}
        actions={
          <>
            {m ? (
              <a href={`/api/projects/${id}/export?type=metadata`}>
                <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />}>
                  .txt
                </Button>
              </a>
            ) : null}
            <Button
              variant={m ? "secondary" : "primary"}
              icon={<Sparkles className="size-4" />}
              disabled={!data.project.script}
              loading={act.isPending && act.variables?.action === "metadata"}
              onClick={() => act.mutate({ action: "metadata" })}
            >
              {m ? t("media.publish.regenerate") : t("media.publish.generate")}
            </Button>
          </>
        }
      />
      <StaleBanner data={data} step="publish">
        {t("media.publish.stale")}
      </StaleBanner>
      <ErrorNote error={act.error} />

      {!m ? (
        <EmptyState icon={<Megaphone className="size-8" />} title={t("media.publish.emptyTitle")}>
          {t("media.publish.emptyBody")}
        </EmptyState>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <Card className="p-4">
              <div className="mb-2 font-medium">{t("media.publish.titleOptions")}</div>
              <ul className="space-y-1.5">
                {m.titles.map((title, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2 ring-1 ring-stone-200">
                    <span className="min-w-0 flex-1 text-[15px] font-medium">{title}</span>
                    <Badge tone={title.length > 70 ? "red" : "neutral"}>{title.length}</Badge>
                    <CopyButton text={title} />
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-medium">{t("media.publish.descriptionLabel")}</div>
                <CopyButton text={m.description} />
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-stone-700">{m.description}</p>
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-medium">
                  {t("media.publish.tags")} <span className="text-sm font-normal text-stone-500">({m.tags.length})</span>
                </div>
                <CopyButton text={m.tags.join(", ")} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.tags.map((tag, i) => (
                  <Badge key={i}>{tag}</Badge>
                ))}
              </div>
            </Card>
          </div>

          <Card className="h-fit p-4">
            <div className="mb-3 font-medium">{t("media.publish.thumbnails")}</div>
            <ul className="space-y-2">
              {m.thumbnailIdeas.map((c, i) => (
                <li key={i} className="flex items-start gap-2 rounded-lg bg-stone-50 p-3 text-sm ring-1 ring-stone-200">
                  <span className="min-w-0 flex-1">{c}</span>
                  <Button size="sm" loading={thumbBusy === c} disabled={Boolean(thumbBusy)} onClick={() => act.mutate({ action: "thumbnail", concept: c })} icon={<ImagePlus className="size-3.5" />}>
                    {t("media.publish.draw")}
                  </Button>
                </li>
              ))}
            </ul>
            {data.thumbnails.length ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {data.thumbnails.map((u) => (
                  <a key={u} href={`${u}?download=1`} className="group relative overflow-hidden rounded-lg ring-1 ring-stone-200" title={t("media.publish.download")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt={t("media.publish.thumbnailAlt")} className="aspect-video w-full object-cover" />
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100">
                      <Download className="size-3.5" />
                    </span>
                  </a>
                ))}
              </div>
            ) : null}
          </Card>
        </div>
      )}

      <StepFooter data={data} step="publish" canApprove={Boolean(m)} hint={t("media.publish.footerHint")} />
    </div>
  );
}
