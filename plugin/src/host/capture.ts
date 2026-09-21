// Reads the document for a generation: composite, selection mask and geometry.
// Three rectangles are kept apart on purpose: the selection as the user made
// it, the generation rectangle padded and fitted to a catalog ratio, and the
// canvas. Mutating one to mean another was the Photoshop plugin's worst bug.

import type { CatalogModel } from "../domain/catalog";
import { planCanvasGeneration, planGenerationBounds, width, height, type Bounds } from "../domain/geometry";
import { cropToCanvas, decodeImage, encodeForUpload, scaleForPixelCap, canvasToBlob } from "../domain/image";
import { isExactSelectionModel } from "../domain/request";
import { HostError, type DocumentIdentity, type Host } from "./types";

/** Largest upload; bigger captures are downscaled (the result is scaled back on placement). */
export const MAX_UPLOAD_PIXELS = 4096 * 4096;

export const MIN_REGION_RATIO = 0.33;
export const MAX_REGION_RATIO = 3;

export type CaptureResult = {
  destination: DocumentIdentity;
  canvas: Bounds;
  /** The selection as the user made it; null for a whole-canvas edit. */
  selection: Bounds | null;
  /** The rectangle sent to the model and covered by the placed result. */
  capture: Bounds;
  /** `W:H` the rectangle was fitted to, or null. */
  aspectRatio: string | null;
  /** The composite cropped to `capture`, encoded for upload. */
  image: Blob;
  /** The selection mask cropped to `capture` at upload scale (white = selected); null without a selection. */
  maskCanvas: HTMLCanvasElement | null;
  /** The mask as PNG, for models that take one. */
  maskBlob: Blob | null;
  /** Scale applied to the upload (<= 1) so a huge capture stays under the pixel cap. */
  uploadScale: number;
  foregroundHex: string | null;
};

export type CaptureOptions = {
  maxPixels?: number;
  onStage?: (stage: "inspecting" | "exporting" | "encoding") => void;
};

export function documentIdentity(info: DocumentIdentity): DocumentIdentity {
  return { name: info.name, source: info.source, width: info.width, height: info.height, index: info.index };
}

export async function captureForGeneration(host: Host, model: CatalogModel, options: CaptureOptions = {}): Promise<CaptureResult> {
  const maxPixels = options.maxPixels ?? MAX_UPLOAD_PIXELS;
  options.onStage?.("inspecting");
  const inspection = await host.inspect();
  if (!inspection.hasDocument || !inspection.document) {
    throw new HostError("no-document", "Open or create a document in Photopea, then generate.");
  }
  const document = inspection.document;
  const canvas: Bounds = { left: 0, top: 0, right: document.width, bottom: document.height };
  const selection = document.selection;
  const exactSelection = isExactSelectionModel(model);
  if (exactSelection && !selection) {
    throw new HostError("no-selection", `${model.title} works on a selection. Select the area in Photopea, then generate.`);
  }

  const plan = selection
    ? planGenerationBounds(exactSelection
      ? { selection, canvas, ratios: [], contextFraction: 0, minPaddingPx: 0, minSide: 0 }
      : { selection, canvas, ratios: model.aspectRatios })
    : planCanvasGeneration({ canvas, ratios: model.aspectRatios });
  const ratio = plan.w / plan.h;
  if (ratio < MIN_REGION_RATIO || ratio > MAX_REGION_RATIO) {
    throw new HostError("placement", "The area to edit is too elongated. Select something closer to square or widen the selection.");
  }

  options.onStage?.("exporting");
  const compositeBytes = await host.exportComposite();
  const maskBytes = selection ? await host.exportSelectionMask() : null;

  options.onStage?.("encoding");
  const composite = await decodeImage(compositeBytes);
  let image: Blob;
  let maskCanvas: HTMLCanvasElement | null = null;
  let maskBlob: Blob | null = null;
  const uploadScale = scaleForPixelCap({ width: width(plan.bounds), height: height(plan.bounds) }, maxPixels);
  try {
    if (composite.width !== document.width || composite.height !== document.height) {
      throw new HostError("script", "The exported image does not match the document size.");
    }
    image = await encodeForUpload(cropToCanvas(composite, plan.bounds, uploadScale));
  } finally {
    composite.close();
  }
  if (maskBytes) {
    const mask = await decodeImage(maskBytes);
    try {
      maskCanvas = cropToCanvas(mask, plan.bounds, uploadScale);
    } finally {
      mask.close();
    }
    if (model.supportMask) maskBlob = await canvasToBlob(maskCanvas, "image/png");
  }

  return {
    destination: documentIdentity(document),
    canvas,
    selection,
    capture: plan.bounds,
    aspectRatio: exactSelection ? null : plan.ratioKey,
    image,
    maskCanvas,
    maskBlob,
    uploadScale,
    foregroundHex: inspection.foregroundHex
  };
}
