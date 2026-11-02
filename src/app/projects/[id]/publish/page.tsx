"use client";

import { useParams } from "next/navigation";
import { Download, ImagePlus, Megaphone, Sparkles } from "lucide-react";
import { useProject, useProjectAction } from "@/lib/client";
import { StaleBanner, StepFooter, StepHeader } from "@/components/step";
import { Badge, Button, Card, CopyButton, EmptyState, ErrorNote, Spinner } from "@/components/ui";

export default function PublishPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useProject(id);
  const act = useProjectAction(id);
  if (!data) return <Spinner />;
  const m = data.project.metadata;
  const thumbBusy = act.isPending && act.variables?.action === "thumbnail" ? String(act.variables.concept) : null;

  return (
    <div>
      <StepHeader
        title="Publish"
        description="Title options, description and tags ready to paste into YouTube Studio, plus thumbnail drafts in the same style."
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
              {m ? "Regenerate" : "Generate metadata"}
            </Button>
          </>
        }
      />
      <StaleBanner data={data} step="publish">
        The script changed after the metadata was approved.
      </StaleBanner>
      <ErrorNote error={act.error} />

      {!m ? (
        <EmptyState icon={<Megaphone className="size-8" />} title="No metadata yet">
          Written from the final script, following your channel&apos;s metadata rules.
        </EmptyState>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <Card className="p-4">
              <div className="mb-2 font-medium">Title options</div>
              <ul className="space-y-1.5">
                {m.titles.map((t, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2 ring-1 ring-stone-200">
                    <span className="min-w-0 flex-1 text-[15px] font-medium">{t}</span>
                    <Badge tone={t.length > 70 ? "red" : "neutral"}>{t.length}</Badge>
                    <CopyButton text={t} />
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-medium">Description</div>
                <CopyButton text={m.description} />
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-stone-700">{m.description}</p>
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-medium">
                  Tags <span className="text-sm font-normal text-stone-500">({m.tags.length})</span>
                </div>
                <CopyButton text={m.tags.join(", ")} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.tags.map((t, i) => (
                  <Badge key={i}>{t}</Badge>
                ))}
              </div>
            </Card>
          </div>

          <Card className="h-fit p-4">
            <div className="mb-3 font-medium">Thumbnails</div>
            <ul className="space-y-2">
              {m.thumbnailIdeas.map((c, i) => (
                <li key={i} className="flex items-start gap-2 rounded-lg bg-stone-50 p-3 text-sm ring-1 ring-stone-200">
                  <span className="min-w-0 flex-1">{c}</span>
                  <Button size="sm" loading={thumbBusy === c} disabled={Boolean(thumbBusy)} onClick={() => act.mutate({ action: "thumbnail", concept: c })} icon={<ImagePlus className="size-3.5" />}>
                    Draw
                  </Button>
                </li>
              ))}
            </ul>
            {data.thumbnails.length ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {data.thumbnails.map((u) => (
                  <a key={u} href={`${u}?download=1`} className="group relative overflow-hidden rounded-lg ring-1 ring-stone-200" title="Download">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="Thumbnail draft" className="aspect-video w-full object-cover" />
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

      <StepFooter data={data} step="publish" canApprove={Boolean(m)} hint="Paste the title, description and tags into YouTube Studio → Details." />
    </div>
  );
}
