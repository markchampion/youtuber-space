"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Package, Sparkles } from "lucide-react";
import { api, useChannel, useProducts, type ProductItem } from "@/lib/client";
import { isAdChannel } from "@/lib/channel";
import type { VoiceMode } from "@/lib/types";
import { EMPTY_DRAFT, PhotoStrip, ProductFields, VoiceModeToggle, briefOf, draftReady, useLocalPhotos, type BriefDraft } from "@/components/product-fields";
import { Button, Card, EmptyState, ErrorNote, Label, Spinner, Tabs, cn } from "@/components/ui";

type Source = "saved" | "new";

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
        <EmptyState icon={<ImagePlus className="size-8" />} title="Switch to a product-ad channel">
          {data.channel.name} makes long-form videos. Pick a product-ad channel in the channel menu, or{" "}
          <Link href="/channel/new" className="font-medium text-brand-ink underline">
            create one
          </Link>
          .
        </EmptyState>
      </main>
    );
  }

  const ready = mode === "saved" ? Boolean(picked && list.some((p) => p.id === picked)) : photos.photos.length > 0 && draftReady(draft);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">New ad</h1>
      <p className="mt-1 text-sm text-stone-600">
        Pick a saved product or add a new one. Each new video gets a fresh script and a visual direction its earlier videos haven&apos;t used, so the images
        always look different.
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
            { value: "saved", label: `Saved product${list.length ? ` (${list.length})` : ""}` },
            { value: "new", label: "New product" },
          ]}
        />

        {mode === "saved" ? (
          list.length ? (
            <div role="radiogroup" aria-label="Product" className="grid gap-3 sm:grid-cols-2">
              {list.map((p) => (
                <ProductChoice key={p.id} product={p} selected={picked === p.id} onSelect={() => setPicked(p.id)} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Package className="size-8" />} title="No saved products yet">
              Add your first one under <b>New product</b>; it&apos;s saved for next time.
            </EmptyState>
          )
        ) : (
          <>
            <Card className="p-5">
              <Label hint="1–3 photos · a plain background works best">Product photos</Label>
              <div className="mt-2">
                <PhotoStrip urls={photos.photos.map((p) => p.url)} onAdd={photos.add} onRemove={photos.remove} />
              </div>
              {photos.error ? <p className="mt-2 text-sm text-red-700">{photos.error}</p> : null}
            </Card>
            <Card className="p-5">
              <ProductFields value={draft} onChange={setDraft} />
              <p className="mt-3 text-xs text-stone-500">Saved to this channel&apos;s Products so you can reuse it.</p>
            </Card>
          </>
        )}

        <Card className="p-5">
          <Label>Sound</Label>
          <div className="mt-2">
            <VoiceModeToggle value={voiceMode} onChange={setVoiceMode} />
          </div>
        </Card>

        <ErrorNote error={create.error} />
        <div className="flex items-center justify-end gap-3">
          {create.isPending ? <span className="text-sm text-stone-500">{mode === "new" ? "Uploading and writing the script…" : "Writing the script…"}</span> : null}
          <Button type="submit" variant="primary" loading={create.isPending} disabled={!ready} icon={<Sparkles className="size-4" />}>
            Create ad
          </Button>
        </div>
      </form>
    </main>
  );
}

function ProductChoice({ product: p, selected, onSelect }: { product: ProductItem; selected: boolean; onSelect: () => void }) {
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
          {p.videos} video{p.videos === 1 ? "" : "s"}
        </span>
      </span>
    </button>
  );
}
