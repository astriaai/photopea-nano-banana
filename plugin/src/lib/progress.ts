// Adapted from nano-banana-photoshop-uxp/nano-banana/ui-src/src/lib/progress.ts
// (commit ffe30c1b). The provider reports no real progress: the bar is a
// time estimate from the catalog's average duration and timeout.

import type { JobStage } from "../app/state";

export type ProgressEstimate = {
  /** 0-1 for a determinate bar, or null for an indeterminate one. */
  value: number | null;
  detail: string;
};

export const STAGE_LABELS: Record<JobStage, string> = {
  capturing: "Reading the document…",
  submitting: "Uploading to astria.ai…",
  generating: "Generating…",
  downloading: "Downloading the result…",
  placing: "Placing the result in Photopea…"
};

export type StageInfo = { stage: JobStage; model?: string; current?: number; total?: number; cancelling?: boolean };

export function stageLabel(job: StageInfo): string {
  if (job.cancelling) return "Stopping…";
  if (job.stage === "generating" && job.model) return `Generating with ${job.model}…`;
  if (job.stage === "placing" && job.total && job.total > 1) {
    return job.current ? `Placing image ${job.current} of ${job.total}…` : `Placing ${job.total} images…`;
  }
  return STAGE_LABELS[job.stage] ?? "Working…";
}

export function formatSeconds(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole}s`;
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

export function estimateProgress(job: { stage: JobStage; startedAt?: number; avgTime?: number; timeout?: number }, now: number): ProgressEstimate {
  if (job.stage !== "generating" || !job.startedAt) return { value: null, detail: "" };
  const elapsed = Math.max(0, (now - job.startedAt) / 1000);
  const avgTime = job.avgTime && job.avgTime > 0 ? job.avgTime : 0;
  const timeout = job.timeout && job.timeout > 0 ? job.timeout : 0;
  if (!avgTime) return { value: null, detail: `${formatSeconds(elapsed)} elapsed` };
  if (elapsed < avgTime) {
    return { value: Math.min(0.99, Math.max(0.01, elapsed / avgTime)), detail: `${formatSeconds(elapsed)} elapsed · usually about ${formatSeconds(avgTime)}` };
  }
  if (timeout) {
    const remaining = Math.max(Math.ceil(timeout - elapsed), 0);
    return { value: 0.99, detail: `Almost done… ${formatSeconds(remaining)} until timeout` };
  }
  return { value: 0.99, detail: `Almost done… ${formatSeconds(elapsed)} elapsed` };
}
