// Pure geometry for the generation flow: which rectangle to capture around a
// selection, how to scale a placed result onto it, and how wide to feather the
// reveal mask. Ported from the Photoshop plugin's generationBounds.js
// (nano-banana-photoshop-uxp); no host or DOM access.

export type Bounds = { left: number; top: number; right: number; bottom: number };

export function width(bounds: Bounds): number {
  return bounds.right - bounds.left;
}

export function height(bounds: Bounds): number {
  return bounds.bottom - bounds.top;
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function logDistance(a: number, b: number): number {
  return Math.abs(Math.log(a) - Math.log(b));
}

export function boundsEqual(a: Bounds | null, b: Bounds | null): boolean {
  if (!a || !b) return a === b;
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
}

/** Photopea reports bounds as [left, top, right, bottom]. */
export function boundsFromArray(values: ArrayLike<number> | null | undefined): Bounds | null {
  if (!values || values.length < 4) return null;
  const [left, top, right, bottom] = [values[0], values[1], values[2], values[3]];
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom };
}

/** "16:9" -> 16 / 9; null for anything that is not two positive numbers. */
export function parseRatio(key: string): number | null {
  const parts = String(key).split(":");
  if (parts.length !== 2) return null;
  const w = Number(parts[0]);
  const h = Number(parts[1]);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? w / h : null;
}

/**
 * The key in `ratios` nearest to `ratio` in log space (1:2 and 2:1 are equally
 * far from 1:1). `fits(key, value)` may reject candidates; null when none is left.
 */
export function nearestRatioKey(
  ratio: number,
  ratios: readonly string[],
  fits?: (key: string, value: number) => boolean
): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const key of ratios) {
    const value = parseRatio(key);
    if (!value || (fits && !fits(key, value))) continue;
    const distance = logDistance(ratio, value);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = key;
    }
  }
  return best;
}

export type GenerationPlan = {
  bounds: Bounds;
  ratioKey: string | null;
  w: number;
  h: number;
};

export type GenerationPlanOptions = {
  selection: Bounds;
  canvas: Bounds;
  ratios?: readonly string[];
  contextFraction?: number;
  minPaddingPx?: number;
  maxPaddingPx?: number;
  minSide?: number;
};

/**
 * The rectangle to send to the model for `selection` inside `canvas`:
 * 1. context around the selection (a fraction of its longer side, clamped to
 *    [minPaddingPx, maxPaddingPx] per side) and a floor on the short side so a
 *    small selection still comes with its surroundings, each capped by the canvas;
 * 2. the nearest key of `ratios` whose padded box still fits the canvas,
 *    reached by padding the short dimension only (the selection is never cropped);
 * 3. integer size, slid (not clipped) inside the canvas.
 * ratioKey is null when `ratios` is empty or no key fits.
 */
export function planGenerationBounds(options: GenerationPlanOptions): GenerationPlan {
  const { selection, canvas } = options;
  const ratios = options.ratios || [];
  const contextFraction = options.contextFraction ?? 0.125;
  const minPaddingPx = options.minPaddingPx ?? 24;
  const maxPaddingPx = options.maxPaddingPx ?? 256;
  const minSide = options.minSide ?? 1024;
  const canvasWidth = width(canvas);
  const canvasHeight = height(canvas);
  const selectionWidth = width(selection);
  const selectionHeight = height(selection);
  const centerX = (selection.left + selection.right) / 2;
  const centerY = (selection.top + selection.bottom) / 2;

  const padding = clamp(Math.round(contextFraction * Math.max(selectionWidth, selectionHeight)), minPaddingPx, maxPaddingPx);
  let w = Math.min(canvasWidth, Math.max(selectionWidth + 2 * padding, Math.min(minSide, canvasWidth)));
  let h = Math.min(canvasHeight, Math.max(selectionHeight + 2 * padding, Math.min(minSide, canvasHeight)));

  const padTo = (value: number): [number, number] => (w / h > value ? [w, w / value] : [h * value, h]);
  const ratioKey = nearestRatioKey(w / h, ratios, (_, value) => {
    const [paddedWidth, paddedHeight] = padTo(value);
    return paddedWidth <= canvasWidth + 1e-6 && paddedHeight <= canvasHeight + 1e-6;
  });
  if (ratioKey) [w, h] = padTo(parseRatio(ratioKey) as number);

  w = Math.min(Math.round(w), canvasWidth);
  h = Math.min(Math.round(h), canvasHeight);
  const left = clamp(Math.round(centerX - w / 2), canvas.left, canvas.right - w);
  const top = clamp(Math.round(centerY - h / 2), canvas.top, canvas.bottom - h);
  return { bounds: { left, top, right: left + w, bottom: top + h }, ratioKey, w, h };
}

/**
 * The rectangle to generate when there is no selection: the whole canvas, with
 * the key of `ratios` nearest to its proportions.
 */
export function planCanvasGeneration(options: { canvas: Bounds; ratios?: readonly string[] }): GenerationPlan {
  const { canvas } = options;
  const w = width(canvas);
  const h = height(canvas);
  return {
    bounds: { ...canvas },
    ratioKey: nearestRatioKey(w / h, options.ratios || []),
    w,
    h
  };
}

export type PlacementPlan = {
  /** Uniform scale, as the percentage Photopea's layer.resize takes. */
  percent: number;
  scale: number;
  ratioMismatch: boolean;
  placedRatio: number;
  captureRatio: number;
};

/**
 * One uniform scale factor that makes `placedBounds` cover `captureBounds`.
 * Equal ratios give an exact fit; otherwise the larger factor is used so the
 * capture rectangle is never left uncovered (the result is then cropped by the
 * mask or the canvas, never distorted).
 */
export function planPlacement(options: { placedBounds: Bounds; captureBounds: Bounds; tolerance?: number }): PlacementPlan {
  const { placedBounds, captureBounds } = options;
  const tolerance = options.tolerance ?? 0.005;
  const placedWidth = width(placedBounds);
  const placedHeight = height(placedBounds);
  const captureWidth = width(captureBounds);
  const captureHeight = height(captureBounds);
  const placedRatio = placedWidth / placedHeight;
  const captureRatio = captureWidth / captureHeight;
  const scale = Math.max(captureWidth / placedWidth, captureHeight / placedHeight);
  return {
    percent: scale * 100,
    scale,
    ratioMismatch: logDistance(placedRatio, captureRatio) > Math.log(1 + tolerance),
    placedRatio,
    captureRatio
  };
}

/** Translation that moves the centre of `bounds` onto the centre of `target`. */
export function centerDelta(bounds: Bounds, target: Bounds): { dx: number; dy: number } {
  return {
    dx: (target.left + target.right) / 2 - (bounds.left + bounds.right) / 2,
    dy: (target.top + target.bottom) / 2 - (bounds.top + bounds.bottom) / 2
  };
}

/** Pixels to expand and feather the reveal selection by: 2% of its short side, 4-48 px. */
export function revealFeatherRadius(bounds: Bounds): number {
  return clamp(Math.round(0.02 * Math.min(width(bounds), height(bounds))), 4, 48);
}

/** The region of a result image (rw x rh) that lands on `capture` after cover-scaling and centring. */
export function coveredRegion(resultWidth: number, resultHeight: number, capture: Bounds): Bounds {
  const scale = Math.max(width(capture) / resultWidth, height(capture) / resultHeight);
  const w = width(capture) / scale;
  const h = height(capture) / scale;
  const left = (resultWidth - w) / 2;
  const top = (resultHeight - h) / 2;
  return { left, top, right: left + w, bottom: top + h };
}

/** Bounds within `tolerance` px of each other on every edge. */
export function boundsClose(a: Bounds, b: Bounds, tolerance = 2): boolean {
  return Math.abs(a.left - b.left) <= tolerance && Math.abs(a.top - b.top) <= tolerance &&
    Math.abs(a.right - b.right) <= tolerance && Math.abs(a.bottom - b.bottom) <= tolerance;
}
