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
      let placedBounds = check.bounds;
      if (!placedBounds || check.hasSelection) {
        // Bounds are unreliable under a selection; Photopea centres a placed image on the canvas.
        placedBounds = centredBounds(imageWidth, imageHeight, request.destination);
      }
      const plan = planPlacement({ placedBounds, captureBounds: request.capture });
      const result = await host.transformLayer(layerId, plan.percent, request.capture, indexedName(request.layerName, index, request.images.length));
      placedLayerIds.push(layerId);
      lastPlacedId = layerId;
      if (result.placed) {
        const expected = expectedBounds(placedBounds, plan.scale, request.capture);
        if (!boundsClose(result.placed, expected, 3)) {
          warnings.push(`Layer ${index + 1} landed at ${describe(result.placed)} instead of ${describe(expected)}.`);
        }
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

function centredBounds(imageWidth: number, imageHeight: number, document: DocumentIdentity): Bounds {
  const left = Math.round((document.width - imageWidth) / 2);
  const top = Math.round((document.height - imageHeight) / 2);
  return { left, top, right: left + imageWidth, bottom: top + imageHeight };
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
