"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ImageUp, Plus, Sparkles, Trash2, UserRound } from "lucide-react";
import { api, useChannel } from "@/lib/client";
import type { ChannelProfile } from "@/lib/channel";
import { ProfileEditor } from "@/components/profile-editor";
import { BrandingCard } from "@/components/branding-card";
import { ChannelArtCard } from "@/components/channel-art-card";
import { useChannels } from "@/components/channel-switcher";
import { Button, Card, ErrorNote, Spinner, cn } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function ChannelPage() {
  const { data } = useChannel();
  if (!data) return <Spinner className="m-8" />;
  // Keyed by channel so switching channels resets unsaved edits.
  return <ChannelEditor key={data.channel.id} channelId={data.channel.id} saved={data.channel.profile} />;
}

function ChannelEditor({ channelId, saved }: { channelId: string; saved: ChannelProfile }) {
  const t = useT();
  const qc = useQueryClient();
  const [profile, setProfile] = useState<ChannelProfile>(saved);
  const [prevSaved, setPrevSaved] = useState(saved);
  if (prevSaved !== saved) {
    // Server copy changed (e.g. after saving, which normalizes it): adopt it.
    setPrevSaved(saved);
    setProfile(saved);
  }
  const dirty = JSON.stringify(profile) !== JSON.stringify(saved);

  const save = useMutation({
    mutationFn: (p: ChannelProfile) => api("/api/channel", { method: "PUT", json: { id: channelId, profile: p } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel"] });
      qc.invalidateQueries({ queryKey: ["channels"] });
    },
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{t("channel.page.profileLabel")}</div>
          <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight">{saved.name}</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            {t("channel.page.intro")}
          </p>
        </div>
        <div className="flex gap-2">
          <DeleteChannel channelId={channelId} />
          <Link href="/channel/new">
            <Button icon={<Plus className="size-4" />}>{t("channel.page.newChannel")}</Button>
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        <CharacterSection />
        <ChannelArtCard />
        <BrandingCard />
        <ProfileEditor value={profile} onChange={setProfile} />
      </div>

      <div className={cn("sticky bottom-0 mt-6 flex items-center gap-3 border-t border-stone-200 bg-background/95 py-3 backdrop-blur", !dirty && !save.error && "hidden")}>
        <div className="min-w-0 flex-1">
          {save.error ? <ErrorNote error={save.error} /> : <span className="text-sm font-medium text-amber-800">{t("channel.page.unsaved")}</span>}
        </div>
        <Button variant="ghost" disabled={!dirty} onClick={() => setProfile(saved)}>
          {t("channel.page.discard")}
        </Button>
        <Button variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(profile)}>
          {t("channel.page.saveProfile")}
        </Button>
      </div>
    </main>
  );
}

function DeleteChannel({ channelId }: { channelId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const { data } = useChannels();
  const me = data?.channels.find((c) => c.id === channelId);
  const del = useMutation({
    mutationFn: () => api(`/api/channels/${channelId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries(),
  });
  if (!data || data.channels.length <= 1) return null;
  const blocked = (me?.videos ?? 0) > 0;
  return (
    <div className="flex flex-col items-end">
      <Button
        variant="ghost"
        className="text-stone-500 hover:text-red-700"
        disabled={blocked}
        title={blocked ? t("channel.page.deleteBlocked") : t("channel.page.deleteTitle")}
        loading={del.isPending}
        onClick={() => confirm(t("channel.page.deleteConfirm", { name: me?.name ?? "" })) && del.mutate()}
        icon={<Trash2 className="size-4" />}
      >
        {t("common.delete")}
      </Button>
      <ErrorNote error={del.error} />
    </div>
  );
}

function CharacterSection() {
  const t = useT();
  const { data } = useChannel();
  const qc = useQueryClient();
  const gen = useMutation({
    mutationFn: () => api("/api/channel/character", { json: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channel"] }),
  });
  const pick = useMutation({
    mutationFn: (rel: string | null) => api("/api/channel", { method: "PUT", json: { characterRefPath: rel } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channel"] }),
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api("/api/channel/character", { method: "POST", body: fd });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channel"] }),
  });
  if (!data) return null;
  const current = data.channel.characterRefPath;

  return (
    <Card id="character" className="scroll-mt-20 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t("channel.character.title")}</h2>
          <p className="mt-0.5 max-w-xl text-sm text-stone-600">
            {t("channel.character.help")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<ImageUp className="size-4" />} loading={upload.isPending} onClick={() => fileRef.current?.click()}>
            {t("channel.character.upload")}
          </Button>
          <Button variant="primary" icon={<Sparkles className="size-4" />} loading={gen.isPending} onClick={() => gen.mutate()}>
            {t("channel.character.generate")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
      <ErrorNote error={gen.error ?? upload.error ?? pick.error} />
      {!data.candidates.length ? (
        <div className="flex items-center gap-3 rounded-lg bg-stone-50 p-4 text-sm text-stone-600">
          <UserRound className="size-5 text-stone-400" /> {t("channel.character.none")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.candidates.map((c) => {
            const active = c.rel === current;
            return (
              <button
                key={c.rel}
                onClick={() => pick.mutate(active ? null : c.rel)}
                className={cn("relative overflow-hidden rounded-lg ring-1 ring-stone-200 transition-shadow hover:shadow-md", active && "ring-4 ring-emerald-500")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.url} alt={t("channel.character.alt")} className="aspect-video w-full bg-stone-50 object-contain" />
                {active ? (
                  <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-medium text-white">
                    <Check className="size-3" /> {t("channel.inUse")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
