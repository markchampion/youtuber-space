"use client";

import { Fragment, Suspense, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Package, Sparkles } from "lucide-react";
import { api, useChannel, useProducts, type ProductItem } from "@/lib/client";
import { isAdChannel } from "@/lib/channel";
import type { VoiceMode } from "@/lib/types";
import { EMPTY_DRAFT, PhotoStrip, ProductFields, VoiceModeToggle, briefOf, draftReady, useLocalPhotos, type BriefDraft } from "@/components/product-fields";
import { Button, Card, EmptyState, ErrorNote, Label, Spinner, Tabs, cn } from "@/components/ui";
import { useT } from "@/lib/i18n";

type Source = "saved" | "new";

/** Fills `{name}` slots of a translated sentence with React nodes (e.g. a link). */
function rich(text: string, parts: Record<string, ReactNode>): ReactNode {
  return text.split(/\{(\w+)\}/).map((s, i) => (i % 2 ? <Fragment key={i}>{parts[s] ?? `{${s}}`}</Fragment> : s));
}

export default function NewAdPage() {
  // useSearchParams needs a Suspense boundary.
  return (
    <Suspense fallback={<Spinner />}>
      <NewAd />
    </Suspense>
  );
}

function NewAd() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const t = useT();
  const { data } = useChannel();
  const ad = data ? isAdChannel(data.channel.profile) : false;
  const products = useProducts(ad);
  const list = products.data?.products ?? [];
  const [source, setSource] = useState<Source | null>(null);
  const [picked, setPicked] = useState<string | null>(params.get("product"));
  const [draft, setDraft] = useState<BriefDraft>(EMPTY_DRAFT);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("voice");
  const photos = useLocalPhotos();
  // Saved products first when there are any.
  const mode: Source = source ?? (picked || list.length ? "saved" : "new");

  const create = useMutation({
    mutationFn: async () => {
      let id: string;
      if (mode === "saved") {
        ({ id } = await api<{ id: string }>("/api/ads", { json: { productId: picked, voiceMode } }));
      } else {
        const form = new FormData();
        for (const p of photos.photos) form.append("images", p.file);
        form.append("brief", JSON.stringify(briefOf(draft)));
        form.append("voiceMode", voiceMode);
        ({ id } = await api<{ id: string }>("/api/ads", { method: "POST", body: form }));
      }
      // Write the script right away so the first page you see has something to review.
      await api(`/api/projects/${id}`, { json: { action: "adScript" } }).catch(() => null);
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries();
      router.push(`/projects/${id}/script`);
    },
  });

  if (!data || (ad && products.isLoading)) return <Spinner />;
  if (!ad) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState icon={<ImagePlus className="size-8" />} title={t("products.newAd.notAdTitle")}>
          {rich(t("products.newAd.notAdBody", { channel: data.channel.name }), {
            link: (
              <Link href="/channel/new" className="font-medium text-brand-ink underline">
                {t("products.createOne")}
              </Link>
            ),
          })}
        </EmptyState>
      </main>
    );
  }

  const ready = mode === "saved" ? Boolean(picked && list.some((p) => p.id === picked)) : photos.photos.length > 0 && draftReady(draft);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("products.newAd.title")}</h1>
      <p className="mt-1 text-sm text-stone-600">
        {t("products.newAd.intro")}
      </p>

      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) create.mutate();
        }}
      >
        <Tabs<Source>
          value={mode}
          onChange={setSource}
          items={[
            { value: "saved", label: list.length ? t("products.newAd.savedTabCount", { count: list.length }) : t("products.newAd.savedTab") },
            { value: "new", label: t("products.newAd.newTab") },
          ]}
        />

        {mode === "saved" ? (
          list.length ? (
            <div role="radiogroup" aria-label={t("products.newAd.product")} className="grid gap-3 sm:grid-cols-2">
              {list.map((p) => (
                <ProductChoice key={p.id} product={p} selected={picked === p.id} onSelect={() => setPicked(p.id)} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Package className="size-8" />} title={t("products.newAd.noSavedTitle")}>
              {rich(t("products.newAd.noSavedBody"), { tab: <b>{t("products.newAd.newTab")}</b> })}
            </EmptyState>
          )
        ) : (
          <>
            <Card className="p-5">
              <Label hint={t("products.newAd.photosHint")}>{t("products.newAd.photos")}</Label>
              <div className="mt-2">
                <PhotoStrip urls={photos.photos.map((p) => p.url)} onAdd={photos.add} onRemove={photos.remove} />
              </div>
              {photos.error ? <p className="mt-2 text-sm text-red-700">{photos.error}</p> : null}
            </Card>
            <Card className="p-5">
              <ProductFields value={draft} onChange={setDraft} />
              <p className="mt-3 text-xs text-stone-500">{t("products.newAd.savedNote")}</p>
            </Card>
          </>
        )}

        <Card className="p-5">
          <Label>{t("products.newAd.sound")}</Label>
          <div className="mt-2">
            <VoiceModeToggle value={voiceMode} onChange={setVoiceMode} />
          </div>
        </Card>

        <ErrorNote error={create.error} />
        <div className="flex items-center justify-end gap-3">
          {create.isPending ? <span className="text-sm text-stone-500">{mode === "new" ? t("products.newAd.uploadingWriting") : t("products.newAd.writing")}</span> : null}
          <Button type="submit" variant="primary" loading={create.isPending} disabled={!ready} icon={<Sparkles className="size-4" />}>
            {t("products.newAd.createAd")}
          </Button>
        </div>
      </form>
    </main>
  );
}

function ProductChoice({ product: p, selected, onSelect }: { product: ProductItem; selected: boolean; onSelect: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn("flex gap-3 rounded-xl bg-white p-3 text-left ring-1 ring-stone-200 hover:shadow-sm", selected && "ring-2 ring-brand")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.imageUrls[0] ?? ""} alt="" className="size-16 shrink-0 rounded-lg bg-stone-100 object-contain" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{p.name}</span>
        <span className="block truncate text-xs text-stone-500">{p.sellingPoints.join(" · ")}</span>
        <span className="mt-1 block text-xs text-stone-500">
          {p.price ? `${p.price} · ` : ""}
          {t(p.videos === 1 ? "products.videosOne" : "products.videosMany", { count: p.videos })}
        </span>
      </span>
    </button>
  );
}
