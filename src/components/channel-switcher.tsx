"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { api } from "@/lib/client";
import { cn } from "./ui";

type ChannelRow = { id: string; name: string; avatarUrl: string | null; kind: "longform" | "product_ad"; language: string; videos: number; active: boolean };

export function useChannels() {
  return useQuery({ queryKey: ["channels"], queryFn: () => api<{ channels: ChannelRow[] }>("/api/channels") });
}

export function ChannelSwitcher() {
  const qc = useQueryClient();
  const { data } = useChannels();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = data?.channels.find((c) => c.active);

  const switchTo = useMutation({
    mutationFn: (id: string) => api("/api/channels/active", { json: { id } }),
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries(); // everything below depends on the active channel
    },
  });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-8 max-w-[220px] items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-stone-800 ring-1 ring-stone-300 hover:bg-white"
        title="Switch channel"
      >
        {active?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={active.avatarUrl} alt="" className="size-5 shrink-0 rounded-full object-cover ring-1 ring-stone-200" />
        ) : null}
        <span className="truncate">{active?.name ?? "Channel"}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-stone-500" />
      </button>
      {open ? (
        <div className="absolute left-0 top-10 z-40 w-72 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-stone-200" role="listbox">
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Channels</div>
          {data?.channels.map((c) => (
            <button
              key={c.id}
              role="option"
              aria-selected={c.active}
              onClick={() => (c.active ? setOpen(false) : switchTo.mutate(c.id))}
              className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-stone-100", c.active && "bg-stone-50")}
            >
              {c.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.avatarUrl} alt="" className="size-5 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="size-5 shrink-0 rounded-full bg-stone-200" />
              )}
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              {c.kind === "product_ad" ? <span className="rounded bg-rose-50 px-1 text-[10px] font-semibold uppercase text-rose-700">Ad</span> : null}
              <span className="rounded bg-stone-100 px-1 text-[10px] font-semibold uppercase text-stone-500">{c.language}</span>
              <span className="text-xs text-stone-500">
                {c.videos} {c.kind === "product_ad" ? "ad" : "video"}{c.videos === 1 ? "" : "s"}
              </span>
              {c.active ? <Check className="size-4 text-emerald-600" /> : <span className="size-4" />}
            </button>
          ))}
          <div className="my-1 border-t border-stone-200" />
          <Link
            href="/channel/new"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-brand-ink hover:bg-orange-50"
          >
            <Plus className="size-4" /> New channel
          </Link>
        </div>
      ) : null}
    </div>
  );
}
