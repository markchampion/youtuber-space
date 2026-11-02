import "server-only";
import { env } from "@/lib/env";
import type { VoiceMode } from "@/lib/types";
import { getChannel } from "./common";
import { createAdProject } from "./product-ad";
import { getProduct } from "./products";
import { startAutopilot } from "./autopilot";

export type BatchInput = {
  productIds: string[];
  variantsPerProduct: number;
  voiceMode: VoiceMode;
  imageQuality: "low" | "medium" | "high";
  captions: boolean;
};

export const MAX_VARIANTS = 5;

/**
 * Make `variantsPerProduct` new videos for each product and run each one end to end
 * (script → voice → scenes → images → render) with no review pauses. They run in parallel;
 * the shared image, Claude and render limiters keep the load in check.
 */
export function startBatch(input: BatchInput, baseUrl: string) {
  const productIds = [...new Set(input.productIds)];
  if (!productIds.length) throw new Error("Pick at least one product");
  const variants = Math.max(1, Math.min(MAX_VARIANTS, Math.round(input.variantsPerProduct) || 1));
  const products = productIds.map(getProduct);
  const channel = getChannel(products[0].channelId);
  if (products.some((p) => p.channelId !== channel.id)) throw new Error("All products must belong to one channel");
  // Check once up front instead of failing every video separately.
  if (input.voiceMode === "voice" && !env.dryRun && !channel.voiceId) throw new Error("Pick a voice for this channel first (Voice step of any video), or make them silent");

  const projectIds: string[] = [];
  for (const product of products) {
    // One at a time per product so each video sees the visual directions the previous ones took.
    for (let i = 0; i < variants; i++) projectIds.push(createAdProject({ productId: product.id, voiceMode: input.voiceMode }));
  }
  for (const id of projectIds) {
    startAutopilot(id, baseUrl, {
      from: "outline",
      config: { stopAfter: "render", pauseAfter: [], imageQuality: input.imageQuality, captions: input.captions, kenBurns: true },
    });
  }
  return projectIds;
}
