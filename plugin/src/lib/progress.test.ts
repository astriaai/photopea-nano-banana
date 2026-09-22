import { describe, expect, it } from "vitest";
import { estimateProgress, stageLabel } from "./progress";

const snapshot = (over: Partial<{ timingSeconds: number; elapsedSeconds: number; queued: boolean; receivedAt: number }> = {}) => ({
  timingSeconds: 40,
  elapsedSeconds: 10,
  queued: false,
  receivedAt: 100_000,
  ...over
});

describe("estimateProgress with a server snapshot", () => {
  it("shows queued with no bar until the backend starts processing", () => {
    expect(estimateProgress({ stage: "generating", progress: snapshot({ queued: true, elapsedSeconds: 0 }) }, 100_000)).toEqual({ value: null, detail: "Queued", queued: true });
  });

  it("anchors the elapsed time to the snapshot and adds the local clock", () => {
    const job = { stage: "generating" as const, progress: snapshot() };
    expect(estimateProgress(job, 100_000)).toEqual({ value: 0.25, detail: "~30s" });
    expect(estimateProgress(job, 110_000)).toEqual({ value: 0.5, detail: "~20s" });
  });

  it("clamps the bar to 2-95% and reports when the estimate has passed", () => {
    expect(estimateProgress({ stage: "generating", progress: snapshot({ elapsedSeconds: 0 }) }, 100_000).value).toBe(0.02);
    const late = estimateProgress({ stage: "generating", progress: snapshot({ elapsedSeconds: 45 }) }, 100_000);
    expect(late).toEqual({ value: 0.95, detail: "Taking longer than expected..." });
  });

  it("ignores a local clock that is behind the snapshot", () => {
    expect(estimateProgress({ stage: "generating", progress: snapshot() }, 90_000).detail).toBe("~30s");
  });
});

describe("estimateProgress without a snapshot", () => {
  it("falls back to the catalog average and the local clock", () => {
    const job = { stage: "generating" as const, startedAt: 100_000, avgTime: 20, timeout: 60 };
    expect(estimateProgress(job, 105_000)).toEqual({ value: 0.25, detail: "~15s" });
    expect(estimateProgress(job, 125_000)).toEqual({ value: 0.95, detail: "Taking longer than expected..." });
  });

  it("is indeterminate outside the generating stage or without an average", () => {
    expect(estimateProgress({ stage: "capturing" }, 1).value).toBeNull();
    expect(estimateProgress({ stage: "generating", startedAt: 0, avgTime: 0 }, 5_000)).toEqual({ value: null, detail: "5s elapsed" });
  });
});

describe("stageLabel", () => {
  it("names the model while generating and counts placed images", () => {
    expect(stageLabel({ stage: "generating", model: "Nano Banana 2" })).toBe("Generating with Nano Banana 2…");
    expect(stageLabel({ stage: "placing", current: 2, total: 3 })).toBe("Placing image 2 of 3…");
    expect(stageLabel({ stage: "capturing", cancelling: true })).toBe("Stopping…");
  });
});
