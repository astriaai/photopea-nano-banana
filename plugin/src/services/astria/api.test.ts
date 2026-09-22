import { describe, expect, it } from "vitest";
import { parsePrompt } from "./api";
import { serverProgress } from "../../app/generation";

describe("parsePrompt", () => {
  it("reads the progress fields a current backend sends while in flight", () => {
    const prompt = parsePrompt({ id: 5, trained_at: null, started_training_at: "2026-09-22T10:00:00Z", images: [], progress_timing_seconds: 47, progress_elapsed_seconds: 12 });
    expect(prompt.progressTimingSeconds).toBe(47);
    expect(prompt.progressElapsedSeconds).toBe(12);
    expect(serverProgress(prompt, 1_000)).toEqual({ timingSeconds: 47, elapsedSeconds: 12, queued: false, receivedAt: 1_000 });
  });

  it("marks a prompt queued until started_training_at is set", () => {
    const prompt = parsePrompt({ id: 5, trained_at: null, started_training_at: null, images: [], progress_timing_seconds: 47, progress_elapsed_seconds: 0 });
    expect(serverProgress(prompt, 1_000)?.queued).toBe(true);
  });

  it("yields no snapshot from an older backend or a finished prompt", () => {
    expect(serverProgress(parsePrompt({ id: 5, trained_at: null, started_training_at: "2026-09-22T10:00:00Z", images: [] }))).toBeUndefined();
    expect(serverProgress(parsePrompt({ id: 5, trained_at: "2026-09-22T10:01:00Z", images: ["https://mp.astria.ai/x"] }))).toBeUndefined();
    expect(parsePrompt({ id: 5, progress_timing_seconds: -1, progress_elapsed_seconds: "x" }).progressTimingSeconds).toBeNull();
  });
});
