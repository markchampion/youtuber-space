"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, Package, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { api, useChannel, useProducts, type ProductItem } from "@/lib/client";
import { isAdChannel } from "@/lib/channel";
import type { VoiceMode } from "@/lib/types";
import {
  EMPTY_DRAFT,
  PhotoStrip,
  ProductFields,
  VoiceModeToggle,
  briefOf,
  draftOf,
  draftReady,
  useLocalPhotos,
  type BriefDraft,
} from "@/components/product-fields";
import { Badge, Button, Card, EmptyState, ErrorNote, Label, Select, Spinner, cn, fmtUsd } from "@/components/ui";

// Rough $ per image by quality (same table as the cost meter) × ~5 shots per ad.
const IMAGE_PRICE = { low: 0.02, medium: 0.06, high: 0.25 } as const;
const SHOTS_PER_AD = 5;

export default function ProductsPage() {
  const { data } = useChannel();
  const ad = data ? isAdChannel(data.channel.profile) : false;
  const products = useProducts(ad);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  if (!data || (ad && products.isLoading)) return <Spinner />;
  if (!ad) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState icon={<Package className="size-8" />} title="Products belong to product-ad channels">
          Switch to a product-ad channel in the channel menu, or{" "}
          <Link href="/channel/new" className="font-medium text-brand-ink underline">
            create one
          </Link>
          .
        </EmptyState>
      </main>
    );
  }
  const list = products.data?.products ?? [];
  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const chosen = selected.filter((id) => list.some((p) => p.id === id));

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pb-40 pt-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-stone-600">
            Saved products for {data.channel.name}. Every new video gets a fresh script and new images. Select products to batch-generate several ads at
            once.
          </p>
        </div>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)} disabled={adding}>
          Add product
        </Button>
      </div>

      {adding ? <NewProductCard onDone={() => setAdding(false)} /> : null}

      {!list.length && !adding ? (
        <EmptyState icon={<Package className="size-8" />} title="No products yet">
          Add a product with a photo, its selling points and a call to action. Then make as many different ads from it as you like.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((p) => (
            <ProductCard key={p.id} product={p} selected={chosen.includes(p.id)} onToggle={() => toggle(p.id)} />
          ))}
        </div>
      )}

      {chosen.length ? <BatchBar productIds={chosen} dryRun={data.keys.dryRun} onClear={() => setSelected([])} /> : null}
    </main>
  );
}

function ProductCard({ product: p, selected, onToggle }: { product: ProductItem; selected: boolean; onToggle: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("voice");
  const newVideo = useMutation({
    mutationFn: async () => {
      const { id } = await api<{ id: string }>("/api/ads", { json: { productId: p.id, voiceMode } });
      await api(`/api/projects/${id}`, { json: { action: "adScript" } }).catch(() => null);
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries();
      router.push(`/projects/${id}/script`);
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/products?id=${p.id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });

  if (editing) return <EditProductCard product={p} onDone={() => setEditing(false)} />;

  return (
    <Card className={cn("flex flex-col overflow-hidden", selected && "ring-2 ring-brand")}>
      <div className="relative aspect-square bg-stone-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.imageUrls[0] ?? ""} alt="" className="size-full object-contain p-4" />
        <label className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-white/95 px-2 py-1 text-xs font-medium shadow-sm">
          <input type="checkbox" checked={selected} onChange={onToggle} className="size-3.5 accent-orange-500" aria-label={`Select ${p.name} for a batch`} />
          Batch
        </label>
        {p.imageUrls.length > 1 ? <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">{p.imageUrls.length} photos</span> : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <div className="line-clamp-2 font-medium leading-snug">{p.name}</div>
          <div className="mt-0.5 line-clamp-2 text-xs text-stone-500">{p.sellingPoints.join(" · ")}</div>
        </div>
        <div className="flex flex-wrap gap-1">
          {p.price ? <Badge tone="brand">{p.price}</Badge> : null}
          <Badge>
            {p.videos} video{p.videos === 1 ? "" : "s"}
          </Badge>
        </div>
        <div className="mt-auto space-y-2 pt-2">
          <div className="flex gap-1 text-[11px]">
            {(["voice", "none"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setVoiceMode(m)}
                aria-pressed={voiceMode === m}
                className={cn("flex-1 rounded-md px-2 py-1 ring-1 ring-stone-200", voiceMode === m ? "bg-stone-900 text-white ring-stone-900" : "text-stone-600 hover:bg-stone-50")}
              >
                {m === "voice" ? "Voiceover" : "Silent"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="primary" className="flex-1" loading={newVideo.isPending} onClick={() => newVideo.mutate()} icon={<Sparkles className="size-3.5" />}>
              New video
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)} icon={<Pencil className="size-3.5" />} aria-label={`Edit ${p.name}`} />
            <Button
              size="sm"
              variant="ghost"
              loading={remove.isPending}
              disabled={p.videos > 0}
              title={p.videos > 0 ? "Delete its videos first" : "Delete product"}
              onClick={() => confirm(`Delete ${p.name}?`) && remove.mutate()}
              icon={<Trash2 className="size-3.5" />}
              aria-label={`Delete ${p.name}`}
            />
          </div>
          <ErrorNote error={newVideo.error ?? remove.error} />
        </div>
      </div>
    </Card>
  );
}

function NewProductCard({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<BriefDraft>(EMPTY_DRAFT);
  const photos = useLocalPhotos();
  const save = useMutation({
    mutationFn: () => {
      const form = new FormData();
      for (const p of photos.photos) form.append("images", p.file);
      form.append("brief", JSON.stringify(briefOf(draft)));
      return api("/api/products", { method: "POST", body: form });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      onDone();
    },
  });
  return (
    <Card className="mb-6 grid gap-5 p-5 lg:grid-cols-[auto_minmax(0,1fr)]">
      <div>
        <Label hint="1–3">Photos</Label>
        <div className="mt-2 max-w-[17rem]">
          <PhotoStrip size="sm" urls={photos.photos.map((p) => p.url)} onAdd={photos.add} onRemove={photos.remove} />
        </div>
        {photos.error ? <p className="mt-2 text-sm text-red-700">{photos.error}</p> : null}
      </div>
      <div>
        <ProductFields value={draft} onChange={setDraft} compact />
        <ErrorNote error={save.error} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!photos.photos.length || !draftReady(draft)} onClick={() => save.mutate()}>
            Save product
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Edits apply to new videos; videos already made keep the brief they were made with. */
function EditProductCard({ product: p, onDone }: { product: ProductItem; onDone: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<BriefDraft>(draftOf(p));
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["products"] });
  const save = useMutation({
    mutationFn: () => api("/api/products", { method: "PUT", json: { id: p.id, brief: briefOf(draft) } }),
    onSuccess: () => {
      refresh();
      onDone();
    },
  });

  async function addPhotos(files: FileList | null) {
    setPhotoError(null);
    setUploading(true);
    try {
      for (const f of [...(files ?? [])].slice(0, 3 - p.imagePaths.length)) {
        const form = new FormData();
        form.append("file", f);
        await api(`/api/products/${p.id}/photos`, { method: "POST", body: form });
      }
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      refresh();
    }
  }
  async function removePhoto(i: number) {
    setPhotoError(null);
    await api(`/api/products/${p.id}/photos?path=${encodeURIComponent(p.imagePaths[i])}`, { method: "DELETE" }).catch((e) => setPhotoError(String(e.message ?? e)));
    refresh();
  }

  return (
    <Card className="space-y-4 p-4 ring-2 ring-brand sm:col-span-2">
      <div>
        <Label hint="used as the image reference">Photos</Label>
        <div className="mt-2">
          <PhotoStrip size="sm" urls={p.imageUrls} onAdd={addPhotos} onRemove={removePhoto} busy={uploading} minKeep={1} />
        </div>
        {photoError ? <p className="mt-1 text-sm text-red-700">{photoError}</p> : null}
      </div>
      <ProductFields value={draft} onChange={setDraft} compact />
      <p className="text-xs text-stone-500">Changes apply to new videos. Videos already made keep the brief they were made with.</p>
      <ErrorNote error={save.error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" loading={save.isPending} disabled={!draftReady(draft)} onClick={() => save.mutate()}>
          Save
        </Button>
      </div>
    </Card>
  );
}

function BatchBar({ productIds, dryRun, onClear }: { productIds: string[]; dryRun: boolean; onClear: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [variants, setVariants] = useState(2);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("voice");
  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
  const [captions, setCaptions] = useState(true);
  const total = productIds.length * variants;
  const estimate = total * SHOTS_PER_AD * IMAGE_PRICE[quality];
  const run = useMutation({
    mutationFn: () =>
      api<{ projectIds: string[] }>("/api/batches", { json: { productIds, variantsPerProduct: variants, voiceMode, imageQuality: quality, captions } }),
    onSuccess: (r) => {
      qc.invalidateQueries();
      router.push(`/?ids=${r.projectIds.join(",")}`);
    },
  });

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-end gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 self-center">
          <Layers className="size-5 text-stone-500" />
          <div className="text-sm">
            <div className="font-medium">
              {productIds.length} product{productIds.length === 1 ? "" : "s"} selected
            </div>
            <button className="text-xs text-stone-500 hover:underline" onClick={onClear}>
              Clear
            </button>
          </div>
        </div>
        <div>
          <Label>Videos each</Label>
          <Select value={variants} onChange={(e) => setVariants(Number(e.target.value))} className="w-24">
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-72">
          <Label>Sound</Label>
          <VoiceModeToggle value={voiceMode} onChange={setVoiceMode} />
        </div>
        <div>
          <Label>Image quality</Label>
          <Select value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)} className="w-32">
            <option value="low">Draft (low)</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        </div>
        <label className="flex items-center gap-2 self-center text-sm">
          <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} className="size-4 accent-orange-500" />
          {voiceMode === "none" ? "On-screen text" : "Captions"}
        </label>
        <div className="ml-auto flex flex-col items-end gap-1">
          <span className="text-xs text-stone-500">
            {total} video{total === 1 ? "" : "s"} · runs script → images → render with no pauses
            {dryRun ? " · dry run, free" : ` · images ≈ ${fmtUsd(estimate)} on the OpenAI API`}
          </span>
          <ErrorNote error={run.error} />
          <Button variant="primary" loading={run.isPending} onClick={() => run.mutate()} icon={<Sparkles className="size-4" />}>
            Generate {total} video{total === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </div>
  );
}
