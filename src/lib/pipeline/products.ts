import "server-only";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import { isAdChannel } from "@/lib/channel";
import { absPath, mediaUrl, writeMedia } from "@/lib/media";
import type { ProductBrief } from "@/lib/types";
import { getChannel } from "./common";

export const MAX_PRODUCT_IMAGES = 3;
export const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;

export type BriefFields = Omit<ProductBrief, "imagePaths">;
export type ProductRow = typeof schema.products.$inferSelect;

export function cleanBrief(b: Partial<BriefFields>, fallback?: BriefFields): BriefFields {
  const name = String(b.name ?? fallback?.name ?? "").trim().slice(0, 80);
  if (!name) throw new Error("Give the product a name");
  const points = (b.sellingPoints ?? fallback?.sellingPoints ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 6);
  if (!points.length) throw new Error("Add at least one selling point");
  const cta = String(b.cta ?? fallback?.cta ?? "").trim().slice(0, 80);
  if (!cta) throw new Error("Add a call to action, e.g. “Shop now at example.com”");
  const opt = (v: unknown) => String(v ?? "").trim().slice(0, 120) || undefined;
  return { name, sellingPoints: points, cta, audience: opt(b.audience ?? fallback?.audience), price: opt(b.price ?? fallback?.price) };
}

const productDir = (channelId: string, productId: string) => path.posix.join("channels", channelId, "products", productId);

/** Normalize an uploaded photo: auto-rotate, max 2048 px, PNG (transparency kept for cut-outs). */
async function savePhoto(channelId: string, productId: string, data: Buffer) {
  if (data.length > MAX_PRODUCT_IMAGE_BYTES) throw new Error("Each product photo must be under 10 MB");
  const png = await sharp(data)
    .rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer()
    .catch(() => {
      throw new Error("That file isn't an image sharp can read (use PNG, JPG or WebP)");
    });
  return writeMedia(path.posix.join(productDir(channelId, productId), `src_${Date.now()}_${nanoid(4)}.png`), png);
}

export function toBrief(p: ProductRow): ProductBrief {
  return {
    name: p.name,
    sellingPoints: p.sellingPoints,
    cta: p.cta,
    audience: p.audience ?? undefined,
    price: p.price ?? undefined,
    imagePaths: p.imagePaths,
  };
}

export function getProduct(id: string) {
  const p = db.select().from(schema.products).where(eq(schema.products.id, id)).get();
  if (!p) throw new Error("Product not found");
  return p;
}

/** A channel's products, most recently used first, with how many videos each has. */
export function listProducts(channelId: string) {
  const usage = new Map(
    db
      .select({ productId: schema.projects.productId, n: sql<number>`count(*)`, last: sql<string>`max(${schema.projects.createdAt})` })
      .from(schema.projects)
      .where(eq(schema.projects.channelId, channelId))
      .groupBy(schema.projects.productId)
      .all()
      .map((r) => [r.productId, r]),
  );
  return db
    .select()
    .from(schema.products)
    .where(eq(schema.products.channelId, channelId))
    .orderBy(desc(schema.products.updatedAt))
    .all()
    .map((p) => ({
      ...p,
      imageUrls: p.imagePaths.map((rel) => mediaUrl(rel)),
      videos: usage.get(p.id)?.n ?? 0,
      lastUsedAt: usage.get(p.id)?.last ?? null,
    }))
    .sort((a, b) => (b.lastUsedAt ?? b.updatedAt).localeCompare(a.lastUsedAt ?? a.updatedAt));
}

export async function createProduct(channelId: string, fields: Partial<BriefFields>, images: Buffer[]) {
  const channel = getChannel(channelId);
  if (!isAdChannel(channel.profile)) throw new Error("Products belong to product-ad channels");
  if (!images.length) throw new Error("Upload at least one product photo");
  if (images.length > MAX_PRODUCT_IMAGES) throw new Error(`Up to ${MAX_PRODUCT_IMAGES} product photos`);
  const brief = cleanBrief(fields);
  const id = nanoid(10);
  const imagePaths: string[] = [];
  try {
    for (const img of images) imagePaths.push(await savePhoto(channel.id, id, img));
  } catch (e) {
    fs.rmSync(absPath(productDir(channel.id, id)), { recursive: true, force: true });
    throw e;
  }
  db.insert(schema.products)
    .values({ id, channelId: channel.id, ...brief, audience: brief.audience ?? null, price: brief.price ?? null, imagePaths })
    .run();
  return id;
}

export function updateProduct(id: string, patch: Partial<BriefFields>) {
  const cur = getProduct(id);
  const next = cleanBrief(patch, toBrief(cur));
  db.update(schema.products)
    .set({ ...next, audience: next.audience ?? null, price: next.price ?? null, updatedAt: new Date().toISOString() })
    .where(eq(schema.products.id, id))
    .run();
  return getProduct(id);
}

export async function addProductPhoto(id: string, data: Buffer) {
  const cur = getProduct(id);
  if (cur.imagePaths.length >= MAX_PRODUCT_IMAGES) throw new Error(`Up to ${MAX_PRODUCT_IMAGES} product photos`);
  const rel = await savePhoto(cur.channelId, id, data);
  db.update(schema.products)
    .set({ imagePaths: [...cur.imagePaths, rel], updatedAt: new Date().toISOString() })
    .where(eq(schema.products.id, id))
    .run();
  return rel;
}

/** Videos keep a snapshot of the photo list, so a file is only deleted once no video uses it. */
export function removeProductPhoto(id: string, rel: string) {
  const cur = getProduct(id);
  if (!cur.imagePaths.includes(rel)) throw new Error("Unknown product photo");
  if (cur.imagePaths.length <= 1) throw new Error("Keep at least one product photo");
  db.update(schema.products)
    .set({ imagePaths: cur.imagePaths.filter((x) => x !== rel), updatedAt: new Date().toISOString() })
    .where(eq(schema.products.id, id))
    .run();
  const inUse = db
    .select({ product: schema.projects.product })
    .from(schema.projects)
    .where(eq(schema.projects.productId, id))
    .all()
    .some((p) => p.product?.imagePaths.includes(rel));
  if (!inUse) fs.rmSync(absPath(rel), { force: true });
}

export function deleteProduct(id: string) {
  const cur = getProduct(id);
  const used = db.select({ n: sql<number>`count(*)` }).from(schema.projects).where(eq(schema.projects.productId, id)).get()?.n ?? 0;
  if (used) throw new Error(`This product has ${used} video(s). Delete them first.`);
  db.delete(schema.products).where(eq(schema.products.id, id)).run();
  fs.rmSync(absPath(productDir(cur.channelId, id)), { recursive: true, force: true });
}

/** Earlier videos of a product, newest first (for variety: hooks, scenes and visual directions to avoid). */
export function previousVideos(productId: string, excludeProjectId?: string, limit = 5) {
  return db
    .select({ id: schema.projects.id, script: schema.projects.script, variantHint: schema.projects.variantHint })
    .from(schema.projects)
    .where(eq(schema.projects.productId, productId))
    .orderBy(desc(schema.projects.createdAt))
    .all()
    .filter((p) => p.id !== excludeProjectId)
    .slice(0, limit);
}

/**
 * One-time upgrade: ads made before the product library carried their own brief and photos.
 * Turn each into a saved product (photos copied, so deleting the old video keeps them) and link it.
 */
export function backfillProducts() {
  const orphans = db
    .select()
    .from(schema.projects)
    .all()
    .filter((p) => p.product && !p.productId);
  for (const p of orphans) {
    const brief = p.product!;
    const id = nanoid(10);
    const imagePaths = brief.imagePaths
      .filter((rel) => fs.existsSync(absPath(rel)))
      .map((rel) => {
        const to = path.posix.join(productDir(p.channelId, id), path.posix.basename(rel));
        fs.mkdirSync(path.dirname(absPath(to)), { recursive: true });
        fs.copyFileSync(absPath(rel), absPath(to));
        return to;
      });
    db.insert(schema.products)
      .values({
        id,
        channelId: p.channelId,
        name: brief.name,
        sellingPoints: brief.sellingPoints,
        audience: brief.audience ?? null,
        cta: brief.cta,
        price: brief.price ?? null,
        imagePaths,
        createdAt: p.createdAt,
      })
      .run();
    db.update(schema.projects).set({ productId: id }).where(eq(schema.projects.id, p.id)).run();
  }
  return orphans.length;
}

// Run the upgrade once per server process, the first time anything touches products.
const g = globalThis as unknown as { __productsBackfilled?: boolean };
if (!g.__productsBackfilled) {
  g.__productsBackfilled = true;
  try {
    backfillProducts();
  } catch (e) {
    console.error("[products] backfill failed", e);
  }
}
