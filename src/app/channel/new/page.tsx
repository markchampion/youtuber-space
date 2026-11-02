"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clapperboard, ShoppingBag, Sparkles, Wand2 } from "lucide-react";
import { api } from "@/lib/client";
import { isAdChannel, type ChannelKind, type ChannelProfile } from "@/lib/channel";
import { AD_STYLE_PRESETS } from "@/lib/channel-seed-ad";
import { STYLE_PRESETS } from "@/lib/style-presets";
import { ProfileEditor } from "@/components/profile-editor";
import { LANGUAGES } from "@/lib/languages";
import { Button, Card, ErrorNote, Input, Label, Select, Textarea, cn } from "@/components/ui";

export default function NewChannelPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [kind, setKind] = useState<ChannelKind>("longform");
  const ad = kind === "product_ad";
  const presets = ad ? AD_STYLE_PRESETS : STYLE_PRESETS;
  const [description, setDescription] = useState("");
  const [examples, setExamples] = useState("");
  const [tone, setTone] = useState("");
  const [language, setLanguage] = useState("en");
  const [styleKey, setStyleKey] = useState(STYLE_PRESETS[0].key);
  const [customStyle, setCustomStyle] = useState("");
  const [draft, setDraft] = useState<ChannelProfile | null>(null);

  const generate = useMutation({
    mutationFn: () =>
      api<{ profile: ChannelProfile }>("/api/channels", {
        json: { action: "draft", kind, description, examples: examples || undefined, tone: tone || undefined, styleKey, customStyle, language },
      }),
    onSuccess: (r) => {
      setDraft(r.profile);
      window.scrollTo({ top: 0 });
    },
  });
  const create = useMutation({
    mutationFn: (profile: ChannelProfile) => api<{ id: string }>("/api/channels", { json: { action: "create", profile } }),
    onSuccess: (_r, profile) => {
      qc.invalidateQueries();
      router.push(isAdChannel(profile) ? "/ads/new" : "/ideas");
    },
  });

  if (draft) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <button onClick={() => setDraft(null)} className="mb-3 flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900">
          <ArrowLeft className="size-4" /> Back to the description
        </button>
        <h1 className="text-2xl font-semibold tracking-tight">Review your channel</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          {isAdChannel(draft)
            ? "A ready-made product-ad setup with your brand and style filled in. Check the voice and visual style, then create it. You can change all of this later."
            : "Claude drafted every field from your description. Skim the essentials and angles, tweak anything, then create it. You can change all of this later."}
        </p>
        <div className="mt-6">
          <ProfileEditor value={draft} onChange={setDraft} />
        </div>
        <div className="sticky bottom-0 mt-6 flex items-center gap-3 border-t border-stone-200 bg-background/95 py-3 backdrop-blur">
          <div className="min-w-0 flex-1">
            <ErrorNote error={create.error} />
          </div>
          <Button variant="ghost" loading={generate.isPending} onClick={() => generate.mutate()} icon={<Wand2 className="size-4" />}>
            Draft again
          </Button>
          <Button variant="primary" loading={create.isPending} onClick={() => create.mutate(draft)}>
            Create channel
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">New channel</h1>
      <p className="mt-1 text-sm text-stone-600">
        {ad
          ? "Short vertical ads: upload a product photo, and the AI makes 15–20 second ads with new product scenes, a voiceover and captions."
          : "Describe the channel in a few sentences. Claude drafts the whole profile: topic angles, hook style, character, palette and more."}
      </p>

      <div role="radiogroup" aria-label="Channel type" className="mt-6 grid gap-3 sm:grid-cols-2">
        {(
          [
            { key: "longform", label: "Long-form video", blurb: "Narrated YouTube explainers: idea → script → scenes → 16:9 video, plus Shorts.", icon: Clapperboard },
            { key: "product_ad", label: "Product ad", blurb: "15–20 s 9:16 ads from your product photo, with voiceover and captions.", icon: ShoppingBag },
          ] as const
        ).map((k) => (
          <button
            key={k.key}
            type="button"
            role="radio"
            aria-checked={kind === k.key}
            onClick={() => {
              setKind(k.key);
              setStyleKey((k.key === "product_ad" ? AD_STYLE_PRESETS : STYLE_PRESETS)[0].key);
            }}
            className={cn(
              "flex items-start gap-3 rounded-xl bg-white p-4 text-left ring-1 ring-stone-200 transition-shadow hover:shadow-sm",
              kind === k.key && "ring-2 ring-brand",
            )}
          >
            <k.icon className="mt-0.5 size-5 shrink-0 text-stone-600" />
            <div>
              <div className="text-sm font-medium">{k.label}</div>
              <div className="text-[13px] text-stone-600">{k.blurb}</div>
            </div>
          </button>
        ))}
      </div>

      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          generate.mutate();
        }}
      >
        <Card className="space-y-4 p-5">
          <div>
            <Label hint={ad ? "the first words become the channel name" : undefined}>{ad ? "Brand or shop" : "Describe your channel"}</Label>
            <Textarea
              rows={ad ? 2 : 4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                ad
                  ? "e.g. Lumi Home. Minimalist home gadgets for small apartments, sold online in Vietnam."
                  : "e.g. Short explainers about the history of space exploration: the failures, the near-disasters and the weird science, for curious adults who aren't scientists."
              }
              autoFocus
            />
          </div>
          {ad ? null : (
            <div>
              <Label hint="optional">Titles or channels you like</Label>
              <Input value={examples} onChange={(e) => setExamples(e.target.value)} placeholder="e.g. Kurzgesagt, “What If the Moon Disappeared?”" />
            </div>
          )}
          <div>
            <Label hint="what the audience hears and reads">Language</Label>
            <Select value={language} onChange={(e) => setLanguage(e.target.value)} className="max-w-xs">
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.native}
                  {l.native !== l.name ? ` (${l.name})` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label hint="optional">{ad ? "Voiceover tone" : "Narration tone"}</Label>
            <Input value={tone} onChange={(e) => setTone(e.target.value)} placeholder={ad ? "e.g. warm and playful, like a friend's recommendation" : "e.g. calm and curious, 2nd person"} />
          </div>
        </Card>

        <div>
          <div className="mb-2 text-sm font-medium text-stone-700">Visual style</div>
          <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
            {[...presets, { key: "custom", label: "Custom…", blurb: "Describe your own style.", prompt: "", swatch: [] as string[] }].map((s) => (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={styleKey === s.key}
                onClick={() => setStyleKey(s.key)}
                className={cn(
                  "flex items-start gap-3 rounded-xl bg-white p-4 text-left ring-1 ring-stone-200 transition-shadow hover:shadow-sm",
                  styleKey === s.key && "ring-2 ring-brand",
                )}
              >
                <div className="flex shrink-0 -space-x-1.5 pt-0.5">
                  {s.swatch.length ? (
                    s.swatch.map((c) => <span key={c} className="size-5 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.15)] ring-2 ring-white" style={{ background: c }} />)
                  ) : (
                    <span className="grid size-5 place-items-center rounded-full bg-stone-100 text-[10px] text-stone-500 ring-2 ring-white">?</span>
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="text-[13px] text-stone-600">{s.blurb}</div>
                </div>
              </button>
            ))}
          </div>
          {styleKey === "custom" ? (
            <Textarea
              rows={2}
              className="mt-3"
              value={customStyle}
              onChange={(e) => setCustomStyle(e.target.value)}
              placeholder="e.g. 1950s retro print style, halftone texture, cream and teal, cartoon astronauts"
            />
          ) : null}
        </div>

        <ErrorNote error={generate.error} />
        <div className="flex items-center justify-end gap-3">
          {generate.isPending && !ad ? <span className="text-sm text-stone-500">Drafting the profile. This takes about 30–60 seconds…</span> : null}
          <Button type="submit" variant="primary" loading={generate.isPending} disabled={!description.trim()} icon={<Sparkles className="size-4" />}>
            {ad ? "Set up channel" : "Draft channel"}
          </Button>
        </div>
      </form>
    </main>
  );
}
