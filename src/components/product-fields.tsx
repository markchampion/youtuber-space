"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Mic, MicOff, X } from "lucide-react";
import type { ProductBrief, VoiceMode } from "@/lib/types";
import { Input, Label, Textarea, cn } from "./ui";

export const MAX_PRODUCT_PHOTOS = 3;
const MAX_BYTES = 10 * 1024 * 1024;

/** Editable text of a product brief; selling points are one per line. */
export type BriefDraft = { name: string; points: string; cta: string; price: string; audience: string };

export const EMPTY_DRAFT: BriefDraft = { name: "", points: "", cta: "", price: "", audience: "" };

export function draftOf(b: Pick<ProductBrief, "name" | "sellingPoints" | "cta"> & { price?: string | null; audience?: string | null }): BriefDraft {
  return { name: b.name, points: b.sellingPoints.join("\n"), cta: b.cta, price: b.price ?? "", audience: b.audience ?? "" };
}

export function briefOf(d: BriefDraft) {
  return { name: d.name, sellingPoints: d.points.split("\n"), cta: d.cta, price: d.price, audience: d.audience };
}

export const draftReady = (d: BriefDraft) => Boolean(d.name.trim() && d.points.trim() && d.cta.trim());

export function ProductFields({ value, onChange, compact }: { value: BriefDraft; onChange: (v: BriefDraft) => void; compact?: boolean }) {
  const set = (k: keyof BriefDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <div>
        <Label>Product name</Label>
        <Input value={value.name} onChange={set("name")} placeholder="e.g. Lumi Mini Desk Lamp" />
      </div>
      <div>
        <Label hint="one per line, 2–4 is ideal">Selling points</Label>
        <Textarea
          rows={compact ? 3 : 4}
          value={value.points}
          onChange={set("points")}
          placeholder={"e.g. Folds flat to fit in any bag\n3 light colors for work and rest\nUSB-C, 12 hours on one charge"}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Call to action</Label>
          <Input value={value.cta} onChange={set("cta")} placeholder="e.g. Shop now at lumi.vn" />
        </div>
        <div>
          <Label hint="optional">Price or offer</Label>
          <Input value={value.price} onChange={set("price")} placeholder="e.g. 299k · 20% off this week" />
        </div>
      </div>
      <div>
        <Label hint="optional">Who it&apos;s for</Label>
        <Input value={value.audience} onChange={set("audience")} placeholder="e.g. students and remote workers in small rooms" />
      </div>
    </div>
  );
}

export type LocalPhoto = { file: File; url: string };

/** Photos picked on this device, not uploaded yet. Preview URLs are revoked on remove and unmount. */
export function useLocalPhotos() {
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(photos);
  useEffect(() => {
    ref.current = photos;
  }, [photos]);
  useEffect(() => () => ref.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  function add(list: FileList | null) {
    setError(null);
    const picked = [...(list ?? [])].filter((f) => f.type.startsWith("image/"));
    const tooBig = picked.find((f) => f.size > MAX_BYTES);
    if (tooBig) return setError(`${tooBig.name} is over 10 MB`);
    const room = MAX_PRODUCT_PHOTOS - photos.length;
    setPhotos((cur) => [...cur, ...picked.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }
  function remove(i: number) {
    URL.revokeObjectURL(photos[i].url);
    setPhotos((cur) => cur.filter((_, k) => k !== i));
  }
  return { photos, error, add, remove };
}

/** Thumbnails with remove buttons plus an "Add photo" tile. Works for local files and saved photos. */
export function PhotoStrip({
  urls,
  onAdd,
  onRemove,
  busy,
  size = "md",
  minKeep = 0,
}: {
  urls: (string | null)[];
  onAdd: (files: FileList | null) => void;
  onRemove: (index: number) => void;
  busy?: boolean;
  size?: "sm" | "md";
  /** Hide remove buttons when only this many are left. */
  minKeep?: number;
}) {
  const box = size === "sm" ? "size-24" : "size-32";
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((src, i) => (
        <div key={`${src}-${i}`} className={cn("relative overflow-hidden rounded-lg bg-stone-100 ring-1 ring-stone-200", box)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src ?? ""} alt={`Product photo ${i + 1}`} className="size-full object-contain" />
          {urls.length > minKeep ? (
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-white/90 text-stone-700 shadow hover:bg-white"
              aria-label={`Remove photo ${i + 1}`}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      ))}
      {urls.length < MAX_PRODUCT_PHOTOS ? (
        <label
          className={cn(
            "grid cursor-pointer place-items-center rounded-lg border-2 border-dashed border-stone-300 text-stone-500 hover:border-stone-400 hover:text-stone-700",
            box,
            busy && "pointer-events-none opacity-60",
          )}
        >
          <span className="flex flex-col items-center gap-1 text-xs">
            <ImagePlus className="size-6" />
            {busy ? "Uploading…" : "Add photo"}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="sr-only"
            onChange={(e) => {
              onAdd(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      ) : null}
    </div>
  );
}

/** Voiceover on, or a silent text-led ad. */
export function VoiceModeToggle({ value, onChange, disabled }: { value: VoiceMode; onChange: (v: VoiceMode) => void; disabled?: boolean }) {
  const opts = [
    { key: "voice" as const, label: "Voiceover", hint: "AI voice reads the script", icon: Mic },
    { key: "none" as const, label: "Silent", hint: "big on-screen text, no audio", icon: MicOff },
  ];
  return (
    <div role="radiogroup" aria-label="Voiceover" className="grid grid-cols-2 gap-2">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          disabled={disabled}
          onClick={() => onChange(o.key)}
          className={cn(
            "flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-left ring-1 ring-stone-200 hover:shadow-sm disabled:opacity-60",
            value === o.key && "ring-2 ring-brand",
          )}
        >
          <o.icon className="size-4 shrink-0 text-stone-600" />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{o.label}</span>
            <span className="block truncate text-[11px] text-stone-500">{o.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
