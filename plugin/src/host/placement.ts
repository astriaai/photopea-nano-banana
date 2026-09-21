// Places generated images into the captured document: one smart object per
// image, scaled uniformly to cover the capture rectangle, masked to the
// selection. Every mutation is followed by a read that checks it happened.
//
// Selection handling: Photopea reports unreliable layer bounds while a
// selection is active, so the selection is first stored in a temporary layer
// mask and cleared, and reloaded from that mask afterwards. When the user's
// selection is still the one captured, each placed layer gets a real
// (expanded and feathered) reveal mask. When it changed or is gone, the mask
// captured at generation time is baked into the image's alpha instead.

import { boundsClose, boundsEqual, centerDelta, planPlacement, revealFeatherRadius, type Bounds, width, height } from "../domain/geometry";
import { bakeMask, blobToDataUrl, canvasToBlob, decodeImage } from "../domain/image";
import { TEMP_LAYER_PREFIX } from "./photopea/adapter";
import { HostError, type DocumentIdentity, type Host } from "./types";

export type MaskMode = "host" | "baked" | "none";

export type PlacementRequest = {
  destination: DocumentIdentity;
  capture: Bounds;
  selection: Bounds | null;
  maskCanvas: HTMLCanvasElement | null;
  images: Blob[];
  layerName: string;
  /** Called before each image is placed (1-based). */
  onProgress?: (current: number, total: number) => void;
};

export type PlacementOutcome = {
  placedLayerIds: number[];
  maskMode: MaskMode;
  warnings: string[];
};

export class PlacementError extends HostError {
  /** Layers that were placed before the failure. */
  placedLayerIds: number[];
  constructor(message: string, placedLayerIds: number[], cause?: unknown) {
    super(cause instanceof HostError ? cause.code : "placement", message);
    this.name = "PlacementError";
    this.placedLayerIds = placedLayerIds;
  }
}

export function placementMessage(error: unknown): string {
  if (error instanceof HostError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

async function imageDataUrl(blob: Blob, maskCanvas: HTMLCanvasElement | null): Promise<{ dataUrl: string; width: number; height: number }> {
  const image = await decodeImage(blob);
  try {
    if (!maskCanvas) return { dataUrl: await blobToDataUrl(blob), width: image.width, height: image.height };
    const baked = bakeMask(image, maskCanvas);
    return { dataUrl: await blobToDataUrl(await canvasToBlob(baked, "image/png")), width: image.width, height: image.height };
  } finally {
    image.close();
  }
}

export async function placeResults(host: Host, request: PlacementRequest): Promise<PlacementOutcome> {
  const warnings: string[] = [];
  const placedLayerIds: number[] = [];
  const document = await host.selectDocument(request.destination);
  if (!document) {
    throw new PlacementError("The document this image was generated for is no longer open. Reopen it and retry placing, or download the result.", placedLayerIds);
  }
  const currentSelection = document.selection;
  let maskMode: MaskMode = "none";
  if (request.selection && request.maskCanvas) {
    maskMode = boundsEqual(currentSelection, request.selection) ? "host" : "baked";
    if (maskMode === "baked") warnings.push(currentSelection ? "The selection changed since the image was generated, so the original selection was applied to the image itself." : "The selection was cleared since the image was generated, so the original selection was applied to the image itself.");
  }

  let tempLayerId: number | null = null;
  let lastPlacedId: number | null = null;
  try {
    if (currentSelection) {
      const stored = await host.storeSelection(`${TEMP_LAYER_PREFIX}_selection`);
      tempLayerId = stored?.tempLayerId ?? null;
      await host.deselect();
    }
    const radius = request.selection ? revealFeatherRadius(request.selection) : 0;
    for (let index = 0; index < request.images.length; index++) {
      request.onProgress?.(index + 1, request.images.length);
      const { dataUrl, width: imageWidth, height: imageHeight } = await imageDataUrl(request.images[index], maskMode === "baked" ? request.maskCanvas : null);
      const { before } = await host.placeImage(dataUrl);
      const check = await host.verifyPlaced(before);
      const layerId = check.activeIsNew ? check.activeId : check.newIds.length === 1 ? check.newIds[0] : null;
      if (layerId === null) {
        throw new HostError("placement", "Photopea did not add the image as a new layer.");
      }
      if (!check.isSmartObject) warnings.push("The result was placed as a raster layer rather than a smart object.");
      // Photopea opens an image at 100%, or fitted inside the canvas when it is
      // larger, centred either way, and reports a layer's opaque bounds only.
      // The extent is therefore derived from the pixel size; the reported
      // bounds merely confirm it for an opaque image.
      const frame = containFrame(imageWidth, imageHeight, request.destination);
      const baked = maskMode === "baked";
      if (!baked && check.bounds && !check.hasSelection && !boundsClose(check.bounds, frame, 3)) {
        warnings.push(`Layer ${index + 1} opened at ${describe(check.bounds)} rather than the expected ${describe(frame)}.`);
      }
      const plan = planPlacement({ placedBounds: frame, captureBounds: request.capture });
      const result = await host.transformLayer(layerId, plan.percent, request.capture, indexedName(request.layerName, index, request.images.length));
      placedLayerIds.push(layerId);
      lastPlacedId = layerId;
      if (result.placed) {
        const expected = expectedBounds(frame, plan.scale, request.capture);
        const fits = baked ? boundsWithin(result.placed, expected, 3) : boundsClose(result.placed, expected, 3);
        if (!fits) warnings.push(`Layer ${index + 1} landed at ${describe(result.placed)} instead of ${describe(expected)}.`);
      }
      if (maskMode === "host" && tempLayerId !== null) {
        await host.applyRevealMask(tempLayerId, layerId, radius);
      }
    }
  } catch (error) {
    await recover(host, tempLayerId, lastPlacedId);
    throw new PlacementError(placementMessage(error), placedLayerIds, error);
  }
  if (tempLayerId !== null) {
    try {
      await host.restoreSelection(tempLayerId, lastPlacedId);
    } catch (error) {
      warnings.push(`The selection could not be restored: ${placementMessage(error)}`);
      await cleanupTempLayers(host);
    }
  }
  return { placedLayerIds, maskMode, warnings };
}

async function recover(host: Host, tempLayerId: number | null, activateId: number | null): Promise<void> {
  try {
    if (tempLayerId !== null) await host.restoreSelection(tempLayerId, activateId);
  } catch {
    await cleanupTempLayers(host);
  }
}

export async function cleanupTempLayers(host: Host): Promise<void> {
  try {
    await host.removeLayersByPrefix(TEMP_LAYER_PREFIX);
  } catch {
    // Nothing more can be done from here; the layer name makes it recognisable.
  }
}

/** Where Photopea puts an opened image: at 100% or fitted inside the canvas, centred. */
export function containFrame(imageWidth: number, imageHeight: number, document: { width: number; height: number }): Bounds {
  const scale = Math.min(1, document.width / imageWidth, document.height / imageHeight);
  const w = imageWidth * scale;
  const h = imageHeight * scale;
  const left = (document.width - w) / 2;
  const top = (document.height - h) / 2;
  return { left, top, right: left + w, bottom: top + h };
}

/** Whether `inner` lies inside `outer`, allowing `tolerance` px of overhang. */
function boundsWithin(inner: Bounds, outer: Bounds, tolerance: number): boolean {
  return inner.left >= outer.left - tolerance && inner.top >= outer.top - tolerance &&
    inner.right <= outer.right + tolerance && inner.bottom <= outer.bottom + tolerance;
}

function expectedBounds(placed: Bounds, scale: number, capture: Bounds): Bounds {
  const w = width(placed) * scale;
  const h = height(placed) * scale;
  const { dx, dy } = centerDelta({ left: 0, top: 0, right: w, bottom: h }, capture);
  return { left: dx, top: dy, right: dx + w, bottom: dy + h };
}

function describe(bounds: Bounds): string {
  return `${Math.round(bounds.left)},${Math.round(bounds.top)} ${Math.round(width(bounds))}×${Math.round(height(bounds))}`;
}

function indexedName(name: string, index: number, total: number): string {
  return total > 1 ? `${name} (${index + 1})` : name;
}
