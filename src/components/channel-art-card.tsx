"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Download, ImageIcon, Sparkles, Stamp, Trash2 } from "lucide-react";
import { api, useChannel } from "@/lib/client";
import { Button, Card, ErrorNote, Spinner, cn } from "./ui";
import { useT } from "@/lib/i18n";

type Kind = "avatar" | "banner";

// UI text lives in the "channel.art.<kind>" messages; the kind is also the download file suffix.

/** Avatar and banner for the channel page, generated from the channel profile. */
export function ChannelArtCard() {
  const t = useT();
  const { data } = useChannel();
  if (!data) return null;
  const dryRun = data.keys.dryRun;
  return (
    <Card id="art" className="scroll-mt-20 space-y-6 p-5">
      <div>
        <h2 className="font-semibold">{t("channel.art.title")}</h2>
        <p className="mt-0.5 max-w-xl text-sm text-stone-600">
          {data.channel.characterRefPath ? t("channel.art.introWithCharacter") : t("channel.art.intro")}
        </p>
        <p className="mt-1 text-xs text-stone-500">{dryRun ? t("channel.art.dryRun") : t("channel.art.cost")}</p>
      </div>
      <ArtRow kind="avatar" />
      <ArtRow kind="banner" />
    </Card>
  );
}

function ArtRow({ kind }: { kind: Kind }) {
  const t = useT();
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
  const slug = data.channel.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "channel";

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{t(`channel.art.${kind}.title`)}</h3>
          <p className="text-[13px] text-stone-600">{t(`channel.art.${kind}.help`)}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-stone-700">
            <input type="checkbox" checked={withName} onChange={(e) => setWithName(e.target.checked)} className="size-4 accent-orange-500" />
            {t("channel.art.includeName")}
          </label>
          <Button variant="primary" size="sm" loading={gen.isPending} onClick={() => gen.mutate()} icon={<Sparkles className="size-3.5" />}>
            {t(`channel.art.${kind}.button`)}
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
                aria-label={active ? t(`channel.art.${kind}.inUseAria`) : t(`channel.art.${kind}.useThis`)}
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
                  <Check className="size-3" /> {t("channel.inUse")}
                </span>
              ) : null}
              <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <a
                  href={c.url}
                  download={`${slug}-${kind}.png`}
                  className="grid size-7 place-items-center rounded-full bg-white/95 text-stone-700 shadow hover:bg-white"
                  aria-label={t("channel.art.download")}
                  title={t("channel.art.downloadPng")}
                >
                  <Download className="size-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => del.mutate(c.rel)}
                  className="grid size-7 place-items-center rounded-full bg-white/95 text-stone-700 shadow hover:bg-white hover:text-red-700"
                  aria-label={t("common.delete")}
                  title={t("common.delete")}
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
            <ImageIcon className="size-5 text-stone-400" /> {t("channel.art.none")}
          </div>
        ) : null}
      </div>

      {art.current ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a href={art.currentUrl ?? ""} download={`${slug}-${kind}.png`}>
            <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />}>
              {t(`channel.art.${kind}.downloadCurrent`)}
            </Button>
          </a>
          {kind === "avatar" ? (
            <>
              <Button size="sm" variant="ghost" loading={logo.isPending} onClick={() => logo.mutate()} icon={<Stamp className="size-3.5" />}>
                {t("channel.art.useAsLogo")}
              </Button>
              {logo.isSuccess ? <span className="text-xs text-emerald-700">{t("channel.art.logoSet")}</span> : null}
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
