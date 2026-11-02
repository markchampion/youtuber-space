"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClaudeStep } from "@/lib/claude-models";
import type { Branding, ChannelKind } from "@/lib/channel";
import type { ProductBrief } from "@/lib/types";
import type { Channel, Idea, Job, Paragraph, Product, Project, Render, Scene, Sentence, Short } from "@/lib/db/schema";

export type RenderRow = Render & { url: string | null; srtUrl: string | null; current: boolean };

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export type ProjectData = {
  project: Project;
  channel: Pick<Channel, "id" | "profile" | "voiceId" | "voiceSettings" | "pronunciations"> & { kind: ChannelKind; characterRefUrl: string | null };
  /** Product ads only. */
  product: (ProductBrief & { imageUrls: (string | null)[] }) | null;
  paragraphs: (Paragraph & { audioUrl: string | null; needsVoice: boolean })[];
  sentences: Sentence[];
  scenes: (Scene & { prompt: string; imageUrl: string | null; needsImage: boolean; start: number | null })[];
  audioUrl: string | null;
  renderUrl: string | null;
  thumbnails: string[];
  jobs: Job[];
  cost: number;
  cliCalls: number;
  renders: RenderRow[];
  /** Bytes the finished-project cleanup would free (renders + Short MP4s). */
  generatedVideoBytes: number;
  shortRenders: Record<string, RenderRow[]>;
  models: Record<ClaudeStep, string>;
  shorts: (Short & { speed: number; duration: number | null; renderUrl: string | null; verticalNeeded: number; verticalDone: number })[];
};

export function useProject(id: string) {
  return useQuery({
    queryKey: ["project", id],
    queryFn: () => api<ProjectData>(`/api/projects/${id}`),
    // Poll while anything is running so progress and results stream in.
    refetchInterval: (q) => (q.state.data?.jobs.some((j) => j.status === "running") ? 1200 : false),
  });
}

/** POST an action to the project RPC endpoint and refresh project data. */
export function useProjectAction<T = Record<string, unknown>>(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { action: string } & Record<string, unknown>) =>
      api<T & { ok: true }>(`/api/projects/${id}`, { json: body }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["project", id] }),
  });
}

export function runningJob(data: ProjectData | undefined, type: string) {
  return data?.jobs.find((j) => j.status === "running" && (j.type === type || j.type.startsWith(type + ":")));
}

/** Autopilot is running on this video: step pages shouldn't start the same work by hand. */
export function autopilotRunning(data: ProjectData | undefined) {
  return Boolean(runningJob(data, "autopilot"));
}

export function lastJob(data: ProjectData | undefined, type: string) {
  return data?.jobs.find((j) => j.type === type);
}

export type ChannelData = {
  channel: Channel;
  characterRefUrl: string | null;
  branding: Branding;
  logoUrl: string | null;
  candidates: { rel: string; url: string }[];
  art: Record<"avatar" | "banner", { current: string | null; currentUrl: string | null; candidates: { rel: string; url: string }[] }>;
  keys: { anthropic: boolean; elevenlabs: boolean; openai: boolean; dryRun: boolean };
};

export function useChannel() {
  return useQuery({ queryKey: ["channel"], queryFn: () => api<ChannelData>("/api/channel") });
}

/** A saved product of the active product-ad channel. */
export type ProductItem = Product & { imageUrls: (string | null)[]; videos: number; lastUsedAt: string | null };

export function useProducts(enabled = true) {
  return useQuery({ queryKey: ["products"], queryFn: () => api<{ products: ProductItem[] }>("/api/products"), enabled });
}

export type { Idea };
