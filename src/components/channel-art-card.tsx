"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Download, ImageIcon, Sparkles, Stamp, Trash2 } from "lucide-react";
import { api, useChannel } from "@/lib/client";
import { Button, Card, ErrorNote, Spinner, cn } from "./ui";

type Kind = "avatar" | "banner";

const COPY: Record<Kind, { title: string; help: string; button: string; file: string }> = {
  avatar: {
    title: "Profile picture",
    help: "800×800, shown as a circle. Upload it as the channel avatar on YouTube, TikTok or Facebook.",
    button: "Generate 2 avatars",
    file: "avatar",
  },
  banner: {
    title: "Banner",
    help: "2560×1440. The dashed box is the part every device shows (phones crop to it), so the name must sit inside.",
    button: "Generate 2 banners",
    file: "banner",
  },
};

/** Avatar and banner for the channel page, generated from the channel profile. */
export function ChannelArtCard() {
  const { data } = useChannel();
  if (!data) return null;
  const dryRun = data.keys.dryRun;
  return (
    <Card id="art" className="scroll-mt-20 space-y-6 p-5">
      <div>
        <h2 className="font-semibold">Channel art</h2>
        <p className="mt-0.5 max-w-xl text-sm text-stone-600">
          A profile picture and a banner in the channel&apos;s style, made from its profile{data.channel.characterRefPath ? " and character reference" : ""}. Generate a
          few, pick one, download it and upload it to your channel.
        </p>
        <p className="mt-1 text-xs text-stone-500">{dryRun ? "Dry run: placeholders, free." : "≈ $0.12 for 2 images at medium quality (free on the Codex image backend)."}</p>
      </div>
      <ArtRow kind="avatar" />
      <ArtRow kind="banner" />
    </Card>
  );
}

function ArtRow({ kind }: { kind: Kind }) {
  const { data } = useChannel();
  const qc = useQueryClient();
  const [withName, setWithName] = useState(true);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["channel"] });
    qc.invalidateQueries({ queryKey: ["channels"] });
  };
  const gen = useMutation({ mutationFn: () => api("/api/channel/art", { json: { kind, withName } }), onSuccess: refresh });
  const pick = useMutation({ mutationFn: (path: string | null) => api("/api/channel/art", { method: "PUT", json: { kind, path } }), onSuccess: refresh });
  const del = useMutation({ mutationFn: (path: string) => api(`/api/channel/art?path=${encodeURIComponent(path)}`, { method: "DELETE" }), onSuccess: refresh });
  const logo = useMutation({ mutationFn: () => api("/api/channel/art", { json: { action: "useAsLogo" } }), onSuccess: refresh });
  if (!data) return null;
  const art = data.art[kind];
  const copy = COPY[kind];
  const slug = data.channel.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "channel";

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{copy.title}</h3>
          <p className="text-[13px] text-stone-600">{copy.help}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-stone-700">
            <input type="checkbox" checked={withName} onChange={(e) => setWithName(e.target.checked)} className="size-4 accent-orange-500" />
            Include channel name
          </label>
          <Button variant="primary" size="sm" loading={gen.isPending} onClick={() => gen.mutate()} icon={<Sparkles className="size-3.5" />}>
            {copy.button}
          </Button>
        </div>
      </div>
      <ErrorNote error={gen.error ?? pick.error ?? del.error ?? logo.error} />

      <div className={cn("grid gap-3", kind === "avatar" ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-5" : "sm:grid-cols-2")}>
        {gen.isPending
          ? [0, 1].map((i) => (
              <div key={`pending-${i}`} className={cn("grid place-items-center bg-stone-100", kind === "avatar" ? "aspect-square rounded-full" : "aspect-video rounded-lg")}>
                <Spinner />
              </div>
            ))
          : null}
        {art.candidates.map((c) => {
          const active = c.rel === art.current;
          return (
            <div key={c.rel} className="group relative">
              <button
                type="button"
                onClick={() => pick.mutate(active ? null : c.rel)}
                aria-pressed={active}
                aria-label={active ? `${copy.title} in use, click to unpick` : `Use this ${copy.title.toLowerCase()}`}
                className={cn(
                  "relative block w-full overflow-hidden ring-1 ring-stone-200 transition-shadow hover:shadow-md",
                  kind === "avatar" ? "aspect-square rounded-full" : "aspect-video rounded-lg",
                  active && "ring-4 ring-emerald-500",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.url} alt="" className="size-full object-cover" />
                {kind === "banner" ? <SafeArea /> : null}
              </button>
              {active ? (
                <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-medium text-white">
                  <Check className="size-3" /> In use
                </span>
              ) : null}
              <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <a
                  href={c.url}
                  download={`${slug}-${copy.file}.png`}
                  className="grid size-7 place-items-center rounded-full bg-white/95 text-stone-700 shadow hover:bg-white"
                  aria-label="Download"
                  title="Download PNG"
                >
                  <Download className="size-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => del.mutate(c.rel)}
                  className="grid size-7 place-items-center rounded-full bg-white/95 text-stone-700 shadow hover:bg-white hover:text-red-700"
                  aria-label="Delete"
                  title="Delete"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        {!gen.isPending && !art.candidates.length ? (
          <div
            className={cn(
              "flex items-center gap-2 bg-stone-50 p-4 text-sm text-stone-500",
              kind === "avatar" ? "col-span-2 rounded-lg sm:col-span-4 lg:col-span-5" : "rounded-lg sm:col-span-2",
            )}
          >
            <ImageIcon className="size-5 text-stone-400" /> None yet.
          </div>
        ) : null}
      </div>

      {art.current ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a href={art.currentUrl ?? ""} download={`${slug}-${copy.file}.png`}>
            <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />}>
              Download {copy.title.toLowerCase()}
            </Button>
          </a>
          {kind === "avatar" ? (
            <>
              <Button size="sm" variant="ghost" loading={logo.isPending} onClick={() => logo.mutate()} icon={<Stamp className="size-3.5" />}>
                Use as watermark logo
              </Button>
              {logo.isSuccess ? <span className="text-xs text-emerald-700">Set. Turn the watermark on under Branding.</span> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** YouTube banner crop guides: 1546×423 is visible everywhere; 2560×423 on desktop. */
function SafeArea() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      <span className="absolute inset-x-0 border-y border-dashed border-white/70" style={{ top: `${((1440 - 423) / 2 / 1440) * 100}%`, bottom: `${((1440 - 423) / 2 / 1440) * 100}%` }} />
      <span
        className="absolute border-2 border-dashed border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
        style={{
          left: `${((2560 - 1546) / 2 / 2560) * 100}%`,
          right: `${((2560 - 1546) / 2 / 2560) * 100}%`,
          top: `${((1440 - 423) / 2 / 1440) * 100}%`,
          bottom: `${((1440 - 423) / 2 / 1440) * 100}%`,
        }}
      />
    </span>
  );
}
