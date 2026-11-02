"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageUp, Stamp, Trash2 } from "lucide-react";
import { api, useChannel } from "@/lib/client";
import { textColors, type Branding, type WatermarkPosition } from "@/lib/channel";
import { Button, Card, ErrorNote, Input, Label, cn, useSyncedState } from "./ui";

const CORNERS: { key: WatermarkPosition; label: string }[] = [
  { key: "top-left", label: "Top left" },
  { key: "top-right", label: "Top right" },
  { key: "bottom-left", label: "Bottom left" },
  { key: "bottom-right", label: "Bottom right" },
];

/** Channel watermark: handle and/or logo, drawn by the renderer on long videos and Shorts. */
export function BrandingCard() {
  const { data } = useChannel();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const b = data?.branding;
  const [text, setText] = useSyncedState(b?.text ?? "");
  const [opacity, setOpacity] = useState<number | null>(null);

  const save = useMutation({
    mutationFn: (branding: Partial<Branding>) => api("/api/channel", { method: "PUT", json: { branding } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channel"] }),
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api("/api/channel/logo", { method: "POST", body: fd });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channel"] }),
  });
  const removeLogo = useMutation({
    mutationFn: () => api("/api/channel/logo", { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channel"] }),
  });

  if (!data || !b) return null;
  const op = opacity ?? b.opacity;
  const colors = textColors(data.channel.profile);
  const mark = (size: "sm" | "xs") =>
    b.enabled && (text.trim() || data.logoUrl) ? (
      <span className="flex items-center gap-1" style={{ opacity: op }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {data.logoUrl ? <img src={data.logoUrl} alt="" className={size === "sm" ? "h-4" : "h-3"} /> : null}
        {text.trim() ? (
          <span className={cn("font-extrabold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]", size === "sm" ? "text-[9px]" : "text-[7px]")}>
            {text.trim()}
          </span>
        ) : null}
      </span>
    ) : null;
  const corner = (p: WatermarkPosition) =>
    cn("absolute", p.startsWith("top") ? "top-1.5" : "bottom-1.5", p.endsWith("left") ? "left-2" : "right-2");

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Stamp className="size-4 text-stone-500" /> Branding
          </h2>
          <p className="mt-0.5 max-w-xl text-[13px] text-stone-600">
            A small watermark with your handle and/or logo, added to every render. It matters most on Shorts, TikTok and Reels, where clips get re-uploaded without credit.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={b.enabled}
          aria-label="Watermark"
          onClick={() => save.mutate({ enabled: !b.enabled })}
          className={cn("relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors", b.enabled ? "bg-brand" : "bg-stone-300")}
        >
          <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform", b.enabled ? "translate-x-5" : "translate-x-0.5")} />
        </button>
      </div>

      <div className={cn("grid gap-6 md:grid-cols-[1fr_auto]", !b.enabled && "opacity-50")}>
        <div className="space-y-4">
          <div>
            <Label hint="max 40 characters">Handle</Label>
            <Input
              value={text}
              maxLength={40}
              placeholder="@yourchannel"
              disabled={!b.enabled}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => text !== b.text && save.mutate({ text })}
            />
          </div>

          <div>
            <Label hint="transparent PNG works best">Logo</Label>
            <div className="flex items-center gap-2">
              {data.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.logoUrl} alt="Logo" className="h-10 w-auto rounded bg-[repeating-conic-gradient(#e7e5e4_0_25%,#fff_0_50%)] bg-[length:12px_12px] p-1 ring-1 ring-stone-200" />
              ) : null}
              <Button size="sm" disabled={!b.enabled} loading={upload.isPending} onClick={() => fileRef.current?.click()} icon={<ImageUp className="size-3.5" />}>
                {data.logoUrl ? "Replace" : "Upload logo"}
              </Button>
              {data.logoUrl ? (
                <Button size="sm" variant="ghost" disabled={!b.enabled} loading={removeLogo.isPending} onClick={() => removeLogo.mutate()} icon={<Trash2 className="size-3.5" />}>
                  Remove
                </Button>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/svg+xml,image/webp,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload.mutate(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div>
            <Label hint="Shorts always use a safe top-left spot">Corner on the long video</Label>
            <div role="radiogroup" aria-label="Watermark corner" className="inline-grid grid-cols-2 gap-1 rounded-lg bg-stone-200/70 p-1">
              {CORNERS.map((c) => (
                <button
                  key={c.key}
                  role="radio"
                  aria-checked={b.position === c.key}
                  disabled={!b.enabled}
                  onClick={() => save.mutate({ position: c.key })}
                  className={cn(
                    "h-8 rounded-md px-3 text-[13px] font-medium",
                    b.position === c.key ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label hint={`${Math.round(op * 100)}%`}>Opacity</Label>
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={op}
              disabled={!b.enabled}
              aria-label="Watermark opacity"
              onChange={(e) => setOpacity(Number(e.target.value))}
              onPointerUp={() => save.mutate({ opacity: op }, { onSuccess: () => setOpacity(null) })}
              onKeyUp={() => save.mutate({ opacity: op }, { onSuccess: () => setOpacity(null) })}
              className="w-full max-w-xs"
            />
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-orange-500" disabled={!b.enabled} checked={b.onLongVideo} onChange={(e) => save.mutate({ onLongVideo: e.target.checked })} />
              Long video
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-orange-500" disabled={!b.enabled} checked={b.onShorts} onChange={(e) => save.mutate({ onShorts: e.target.checked })} />
              Shorts
            </label>
          </div>
          <p className="text-xs text-stone-500">
            On YouTube you can also add a clickable subscribe watermark in YouTube Studio → Customization → Branding. Changing this marks this channel&apos;s videos for a re-render.
          </p>
          <ErrorNote error={save.error ?? upload.error ?? removeLogo.error} />
        </div>

        {/* Live mini previews */}
        <div className="flex items-start gap-4" aria-hidden>
          <div>
            <div className="mb-1 text-center text-[11px] text-stone-500">Long video</div>
            <div className="relative h-[101px] w-[180px] overflow-hidden rounded-md ring-1 ring-stone-300" style={{ background: "#7FB5D5" }}>
              <div className="absolute inset-x-0 bottom-0 h-8" style={{ background: "#D2B488" }} />
              {b.onLongVideo ? <div className={corner(b.position)}>{mark("sm")}</div> : null}
            </div>
          </div>
          <div>
            <div className="mb-1 text-center text-[11px] text-stone-500">Short</div>
            <div className="relative h-[142px] w-[80px] overflow-hidden rounded-md ring-1 ring-stone-300" style={{ background: colors.paper }}>
              <div className="absolute inset-x-0 top-[47px] h-[45px]" style={{ background: "#7FB5D5" }} />
              <div className="absolute inset-x-1 top-[18px] text-center text-[6px] font-bold" style={{ color: colors.text }}>
                HOOK TITLE
              </div>
              {b.onShorts ? <div className="absolute left-1.5 top-1">{mark("xs")}</div> : null}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
