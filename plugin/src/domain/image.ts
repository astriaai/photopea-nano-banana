// Browser-side pixel work: decoding what Photopea exports, cropping to the
// capture rectangle, capping the upload size, baking a selection mask into a
// result's alpha and making thumbnails. Canvas 2D only; no host access.

import { coveredRegion, type Bounds, width, height } from "./geometry";

export type Size = { width: number; height: number };

export async function decodeImage(source: Blob | ArrayBuffer): Promise<ImageBitmap> {
  const blob = source instanceof Blob ? source : new Blob([source]);
  try {
    return await createImageBitmap(blob);
  } catch {
    throw new Error("The image could not be decoded.");
  }
}

export function createCanvas(size: Size): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(size.width));
  canvas.height = Math.max(1, Math.round(size.height));
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");
  return ctx;
}

/** Draws `image` cropped to `bounds` (document pixels) at `scale` into a fresh canvas. */
export function cropToCanvas(image: ImageBitmap, bounds: Bounds, scale = 1): HTMLCanvasElement {
  const canvas = createCanvas({ width: width(bounds) * scale, height: height(bounds) * scale });
  const ctx = context(canvas);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, bounds.left, bounds.top, width(bounds), height(bounds), 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** The scale (<= 1) that keeps `size` within `maxPixels`. */
export function scaleForPixelCap(size: Size, maxPixels: number): number {
  const pixels = size.width * size.height;
  return pixels > maxPixels ? Math.sqrt(maxPixels / pixels) : 1;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The image could not be encoded."))), type, quality);
  });
}

/** True when any sampled pixel is not fully opaque. */
export function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const ctx = context(canvas);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

/** PNG when the pixels carry transparency, otherwise a high-quality JPEG (a smaller upload). */
export async function encodeForUpload(canvas: HTMLCanvasElement): Promise<Blob> {
  return hasTransparency(canvas) ? canvasToBlob(canvas, "image/png") : canvasToBlob(canvas, "image/jpeg", 0.92);
}

/**
 * Multiplies a result image's alpha by a mask (white = keep). The mask covers
 * the capture rectangle; the result covers it after uniform cover-scaling and
 * centring, so the mask is drawn into that centred region and everything
 * outside it is cleared.
 */
export function bakeMask(result: ImageBitmap, mask: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = createCanvas({ width: result.width, height: result.height });
  const ctx = context(canvas);
  ctx.drawImage(result, 0, 0);
  const region = coveredRegion(result.width, result.height, { left: 0, top: 0, right: mask.width, bottom: mask.height });
  const alpha = createCanvas({ width: result.width, height: result.height });
  const alphaCtx = context(alpha);
  alphaCtx.imageSmoothingQuality = "high";
  alphaCtx.drawImage(mask, region.left, region.top, width(region), height(region));
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const maskPixels = alphaCtx.getImageData(0, 0, alpha.width, alpha.height).data;
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    // The mask is greyscale: any channel is the coverage.
    data[i + 3] = Math.round((data[i + 3] * maskPixels[i]) / 255);
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

/** Crops away fully transparent margins; the whole canvas when nothing is opaque. */
export function trimTransparent(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = context(canvas);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width;
  let top = canvas.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return canvas;
  if (left === 0 && top === 0 && right === canvas.width - 1 && bottom === canvas.height - 1) return canvas;
  const trimmed = createCanvas({ width: right - left + 1, height: bottom - top + 1 });
  context(trimmed).drawImage(canvas, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
  return trimmed;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("The image could not be read."));
    reader.readAsDataURL(blob);
  });
}

/** A small JPEG/PNG data URL for a thumbnail tile. */
export async function makeThumbnail(blob: Blob, size = 128): Promise<string> {
  const image = await decodeImage(blob);
  try {
    const scale = Math.min(1, size / Math.max(image.width, image.height));
    const canvas = createCanvas({ width: image.width * scale, height: image.height * scale });
    const ctx = context(canvas);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(hasTransparency(canvas) ? "image/png" : "image/jpeg", 0.85);
  } finally {
    image.close();
  }
}

export function fileExtensionFor(type: string): string {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  return "png";
}
