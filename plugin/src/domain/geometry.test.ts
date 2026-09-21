import { describe, expect, it } from "vitest";
import { boundsFromArray, centerDelta, coveredRegion, nearestRatioKey, parseRatio, planCanvasGeneration, planGenerationBounds, planPlacement, revealFeatherRadius } from "./geometry";

const RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];

describe("ratios", () => {
  it("parses W:H and rejects anything else", () => {
    expect(parseRatio("16:9")).toBeCloseTo(16 / 9);
    expect(parseRatio("square")).toBeNull();
    expect(parseRatio("0:1")).toBeNull();
  });

  it("picks the nearest ratio in log space", () => {
    expect(nearestRatioKey(1.7, RATIOS)).toBe("16:9");
    expect(nearestRatioKey(0.5, RATIOS)).toBe("9:16");
    expect(nearestRatioKey(1, RATIOS, (key) => key !== "1:1")).not.toBe("1:1");
    expect(nearestRatioKey(1, [])).toBeNull();
  });
});

describe("planGenerationBounds", () => {
  const canvas = { left: 0, top: 0, right: 3000, bottom: 2000 };

  it("pads the selection with context and fits a catalog ratio without cropping it", () => {
    const selection = { left: 1000, top: 800, right: 1400, bottom: 1100 };
    const plan = planGenerationBounds({ selection, canvas, ratios: RATIOS });
    expect(plan.w).toBeGreaterThanOrEqual(400);
    expect(plan.h).toBeGreaterThanOrEqual(300);
    expect(plan.bounds.left).toBeLessThanOrEqual(selection.left);
    expect(plan.bounds.top).toBeLessThanOrEqual(selection.top);
    expect(plan.bounds.right).toBeGreaterThanOrEqual(selection.right);
    expect(plan.bounds.bottom).toBeGreaterThanOrEqual(selection.bottom);
    expect(plan.ratioKey).not.toBeNull();
    const ratio = parseRatio(plan.ratioKey!)!;
    expect(plan.w / plan.h).toBeCloseTo(ratio, 1);
  });

  it("raises a small selection to the minimum side and stays inside the canvas", () => {
    const selection = { left: 10, top: 10, right: 60, bottom: 60 };
    const plan = planGenerationBounds({ selection, canvas, ratios: ["1:1"] });
    expect(plan.w).toBe(1024);
    expect(plan.h).toBe(1024);
    expect(plan.bounds.left).toBe(0);
    expect(plan.bounds.top).toBe(0);
  });

  it("returns the selection verbatim for an exact-selection model", () => {
    const selection = { left: 100, top: 100, right: 500, bottom: 300 };
    const plan = planGenerationBounds({ selection, canvas, ratios: [], contextFraction: 0, minPaddingPx: 0, minSide: 0 });
    expect(plan.bounds).toEqual(selection);
    expect(plan.ratioKey).toBeNull();
  });

  it("never exceeds a small canvas", () => {
    const small = { left: 0, top: 0, right: 500, bottom: 371 };
    const plan = planGenerationBounds({ selection: { left: 40, top: 30, right: 300, bottom: 300 }, canvas: small, ratios: RATIOS });
    expect(plan.w).toBeLessThanOrEqual(500);
    expect(plan.h).toBeLessThanOrEqual(371);
    expect(plan.bounds.left).toBeGreaterThanOrEqual(0);
    expect(plan.bounds.bottom).toBeLessThanOrEqual(371);
  });
});

describe("planCanvasGeneration", () => {
  it("uses the whole canvas and the nearest ratio", () => {
    const plan = planCanvasGeneration({ canvas: { left: 0, top: 0, right: 1920, bottom: 1080 }, ratios: RATIOS });
    expect(plan.bounds).toEqual({ left: 0, top: 0, right: 1920, bottom: 1080 });
    expect(plan.ratioKey).toBe("16:9");
  });
});

describe("planPlacement", () => {
  it("scales uniformly to cover and flags a ratio mismatch", () => {
    const plan = planPlacement({ placedBounds: { left: 0, top: 0, right: 1024, bottom: 1024 }, captureBounds: { left: 0, top: 0, right: 800, bottom: 600 } });
    expect(plan.scale).toBeCloseTo(800 / 1024);
    expect(plan.percent).toBeCloseTo(78.125);
    expect(plan.ratioMismatch).toBe(true);
  });

  it("fits exactly when ratios match", () => {
    const plan = planPlacement({ placedBounds: { left: 0, top: 0, right: 2048, bottom: 1536 }, captureBounds: { left: 100, top: 100, right: 1124, bottom: 868 } });
    expect(plan.percent).toBeCloseTo(50);
    expect(plan.ratioMismatch).toBe(false);
  });
});

describe("helpers", () => {
  it("centres bounds on a target", () => {
    expect(centerDelta({ left: 0, top: 0, right: 100, bottom: 50 }, { left: 200, top: 200, right: 300, bottom: 250 })).toEqual({ dx: 200, dy: 200 });
  });

  it("feathers by 2% of the short side within 4-48", () => {
    expect(revealFeatherRadius({ left: 0, top: 0, right: 100, bottom: 100 })).toBe(4);
    expect(revealFeatherRadius({ left: 0, top: 0, right: 1000, bottom: 2000 })).toBe(20);
    expect(revealFeatherRadius({ left: 0, top: 0, right: 9000, bottom: 9000 })).toBe(48);
  });

  it("maps the capture rectangle onto a cover-scaled result", () => {
    const region = coveredRegion(1024, 1024, { left: 0, top: 0, right: 800, bottom: 600 });
    expect(region.left).toBe(0);
    expect(region.right).toBe(1024);
    expect(region.top).toBeCloseTo(128);
    expect(region.bottom).toBeCloseTo(896);
  });

  it("reads Photopea bounds arrays", () => {
    expect(boundsFromArray([1, 2, 3, 4])).toEqual({ left: 1, top: 2, right: 3, bottom: 4 });
    expect(boundsFromArray(null)).toBeNull();
    expect(boundsFromArray([5, 5, 5, 5])).toBeNull();
  });
});
