"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ImagePlus, RefreshCw, Shuffle, Sparkles, X } from "lucide-react";
import { api, autopilotRunning, useProjectAction, type ProjectData } from "@/lib/client";
import { estimateMinutes, splitSentences, wordCount } from "@/lib/sync";
import { pacingOf } from "@/lib/channel";
import { silentTimings } from "@/lib/silent-timing";
import { StaleBanner, StepFooter, StepHeader } from "./step";
import { VoiceModeToggle } from "./product-fields";
import { Badge, Button, Card, ErrorNote, Input, Label, Textarea, cn, useSyncedState } from "./ui";

/** Ads run 15–20 s; the voice speed decides how many words fit. */
const TARGET_SECONDS = { min: 15, max: 20 };

export function AdScriptEditor({ data }: { data: ProjectData }) {
  const id = data.project.id;
  const qc = useQueryClient();
  const act = useProjectAction(id);
  const pilot = autopilotRunning(data);
  const product = data.product;
  const silent = data.project.voiceMode === "none";

  // ---- Brief ----
  const [name, setName] = useSyncedState(product?.name ?? "");
  const [points, setPoints] = useSyncedState((product?.sellingPoints ?? []).join("\n"));
  const [cta, setCta] = useSyncedState(product?.cta ?? "");
  const [price, setPrice] = useSyncedState(product?.price ?? "");
  const [audience, setAudience] = useSyncedState(product?.audience ?? "");
  const briefChanged =
    product &&
    (name !== product.name || points !== product.sellingPoints.join("\n") || cta !== product.cta || price !== (product.price ?? "") || audience !== (product.audience ?? ""));
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // ---- Script (autosaved like the long-form editor) ----
  const [draft, setDraft] = useState(data.project.script ?? "");
  const lastServer = useRef(data.project.script ?? "");
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    const server = data.project.script ?? "";
    if (server !== lastServer.current) setDraft((cur) => (cur === lastServer.current ? server : cur));
    lastServer.current = server;
  }, [data.project.script]);
  useEffect(() => {
    if (pilot || draft === (data.project.script ?? "")) return;
    const t = setTimeout(() => act.mutate({ action: "saveScript", script: draft }), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, pilot]);

  const locale = data.channel.profile.language ?? "en";
  const wpm = pacingOf(data.channel.profile).measuredWpm ?? pacingOf(data.channel.profile).wordsPerMinute;
  const words = wordCount(draft, locale);
  const sentences = draft.trim() ? splitSentences(draft.replace(/\s*\n\s*/g, " "), locale) : [];
  // Silent ads show each line for its reading time; voiced ads last as long as the voice.
  const seconds = Math.round(
    silent ? (silentTimings(sentences.map((x) => wordCount(x.text, locale))).at(-1)?.end ?? 0) : estimateMinutes(words, wpm) * 60,
  );
  const lengthTone = seconds > TARGET_SECONDS.max + 2 ? "warn" : seconds < TARGET_SECONDS.min - 3 ? "warn" : "ok";

  async function saveBrief() {
    await act.mutateAsync({ action: "updateBrief", brief: { name, sellingPoints: points.split("\n"), cta, price, audience } });
  }

  async function regenerate() {
    if (briefChanged) await saveBrief();
    const r = await act.mutateAsync({ action: "adScript", feedback: feedback || undefined });
    setDraft(String((r as { script?: string }).script ?? ""));
    setFeedback("");
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api(`/api/projects/${id}/product`, { method: "POST", body: form });
      qc.invalidateQueries({ queryKey: ["project", id] });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <StepHeader
        title="Brief & script"
        description={`The product photos are the reference for every AI image. The ${silent ? "on-screen text" : "voiceover"} should run 15–20 seconds; the end card with the name and call to action is added after it.`}
      />
      <StaleBanner data={data} step="script">
        The script changed after it was approved. Approve it again to re-voice.
      </StaleBanner>

      <Card className="mb-4 grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <Label>Sound</Label>
          <VoiceModeToggle value={data.project.voiceMode} disabled={pilot || act.isPending} onChange={(mode) => act.mutate({ action: "setVoiceMode", mode })} />
        </div>
        <div>
          <Label hint="picked so this product's videos never look alike">Visual direction</Label>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700 ring-1 ring-stone-200">{data.project.variantHint ?? "Not set"}</div>
            <Button
              variant="secondary"
              size="sm"
              disabled={pilot}
              loading={act.isPending && act.variables?.action === "shuffleVariant"}
              onClick={() => act.mutate({ action: "shuffleVariant" })}
              icon={<Shuffle className="size-3.5" />}
            >
              Shuffle
            </Button>
          </div>
          {data.project.productId ? (
            <p className="mt-1 text-xs text-stone-500">
              Saved product: <Link href="/products" className="underline hover:text-stone-800">{product?.name}</Link>. Brief and photo edits here are saved to it too.
            </p>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="space-y-4 p-4">
          <div>
            <Label hint="used as the image reference · first one on the end card">Product photos</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {product?.imagePaths.map((rel, i) => (
                <div key={rel} className="relative size-24 overflow-hidden rounded-lg bg-stone-100 ring-1 ring-stone-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={product.imageUrls[i] ?? ""} alt={`Product photo ${i + 1}`} className="size-full object-contain" />
                  {product.imagePaths.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => act.mutate({ action: "removeProductImage", path: rel })}
                      className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-white/90 text-stone-700 shadow hover:bg-white"
                      aria-label={`Remove photo ${i + 1}`}
                    >
                      <X className="size-3" />
                    </button>
                  ) : null}
                </div>
              ))}
              {(product?.imagePaths.length ?? 0) < 3 ? (
                <label
                  className={cn(
                    "grid size-24 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-stone-300 text-stone-500 hover:border-stone-400",
                    uploading && "pointer-events-none opacity-60",
                  )}
                >
                  <span className="flex flex-col items-center gap-1 text-[11px]">
                    <ImagePlus className="size-5" />
                    {uploading ? "Uploading…" : "Add"}
                  </span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
                </label>
              ) : null}
            </div>
            {uploadError ? <p className="mt-1 text-sm text-red-700">{uploadError}</p> : null}
          </div>
          <div>
            <Label>Product name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label hint="one per line">Selling points</Label>
            <Textarea rows={4} value={points} onChange={(e) => setPoints(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Call to action</Label>
              <Input value={cta} onChange={(e) => setCta(e.target.value)} />
            </div>
            <div>
              <Label hint="optional">Price or offer</Label>
              <Input value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <div>
            <Label hint="optional">Who it&apos;s for</Label>
            <Input value={audience} onChange={(e) => setAudience(e.target.value)} />
          </div>
          {briefChanged ? (
            <div className="flex justify-end">
              <Button size="sm" loading={act.isPending} onClick={() => saveBrief()}>
                Save brief
              </Button>
            </div>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium">{silent ? "On-screen text" : "Voiceover"}</div>
            <div className="flex items-center gap-2 text-xs text-stone-500">
              <span>{words} words</span>
              <Badge tone={lengthTone === "ok" ? "green" : "amber"}>≈ {seconds}s</Badge>
              <span>{sentences.length} sentences</span>
            </div>
          </div>
          <Textarea
            rows={7}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pilot}
            placeholder="Generate the voiceover from the brief, or write it here."
            className="text-[15px] leading-relaxed"
          />
          {lengthTone === "warn" && words ? (
            <p className="text-xs text-amber-800">
              {seconds > TARGET_SECONDS.max ? (silent ? "Longer than 20 s: cut a line or shorten some." : "Longer than 20 s: shorten it, or speed it up on the Render step.") : "Shorter than 15 s: fine for a teaser, but there is room for another benefit."}
            </p>
          ) : null}
          {sentences.length ? (
            <ol className="space-y-1 text-[13px] text-stone-600">
              {sentences.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-12 shrink-0 text-xs text-stone-400">Shot {i + 1}</span>
                  {s.text}
                </li>
              ))}
            </ol>
          ) : null}
          <div className="mt-auto flex flex-wrap items-end gap-2 border-t border-stone-100 pt-3">
            <div className="min-w-48 flex-1">
              <Input
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={draft ? "Optional: how to change it, e.g. funnier, mention the price" : "Optional: a direction for the copy"}
              />
            </div>
            <Button
              variant={draft ? "secondary" : "primary"}
              loading={act.isPending && act.variables?.action === "adScript"}
              disabled={pilot}
              onClick={() => regenerate()}
              icon={draft ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}
            >
              {draft ? "Rewrite" : "Write voiceover"}
            </Button>
          </div>
          <ErrorNote error={act.error} />
        </Card>
      </div>

      <StepFooter data={data} step="script" canApprove={Boolean(draft.trim()) && !pilot && draft === (data.project.script ?? "")}>
        Each sentence becomes one shot. {silent ? "Approving times each line for reading." : "Approving locks the script for the voiceover."}
      </StepFooter>
    </div>
  );
}
