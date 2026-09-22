// Stage labels and the generation countdown. The countdown mirrors the web
// app's (sdbooth ProgressTile#useProgressEstimate): the backend's P90
// duration for the prompt and its measured processing time drive the bar,
// with the catalog average as the fallback for an older backend.

import type { JobStage, ServerProgress } from "../app/state";

export type ProgressEstimate = {
  /** 0-1 for a determinate bar, or null for an indeterminate one. */
  value: number | null;
  detail: string;
  /** The backend has not started processing yet: the web app shows "Queued" in place of the bar. */
  queued?: boolean;
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

/**
 * The countdown the web app shows for a generating prompt (sdbooth
 * ProgressTile#useProgressEstimate): elapsed processing time over the
 * prompt's P90 duration, both from the backend's latest snapshot with the
 * local clock adding the time since, as a 2-95% bar with the remaining
 * seconds; past the estimate the bar holds and the label says so. While the
 * backend has not started processing the prompt is queued. Without a
 * snapshot (an older backend) the catalog average and the local clock stand
 * in.
 */
export function estimateProgress(
  job: { stage: JobStage; startedAt?: number; avgTime?: number; timeout?: number; progress?: ServerProgress },
  now: number
): ProgressEstimate {
  if (job.stage !== "generating") return { value: null, detail: "" };
  const snapshot = job.progress;
  if (snapshot) {
    if (snapshot.queued) return { value: null, detail: "Queued", queued: true };
    if (!snapshot.timingSeconds) return { value: 0.02, detail: "" };
    const runtime = snapshot.elapsedSeconds + Math.max(0, now - snapshot.receivedAt) / 1000;
    const percent = Math.min(95, Math.max(2, Math.round((runtime / snapshot.timingSeconds) * 100)));
    const remaining = Math.max(0, Math.ceil(snapshot.timingSeconds - runtime));
    return { value: percent / 100, detail: remaining > 0 ? `~${remaining}s` : "Taking longer than expected..." };
  }
  if (job.startedAt == null) return { value: null, detail: "" };
  const elapsed = Math.max(0, (now - job.startedAt) / 1000);
  const avgTime = job.avgTime && job.avgTime > 0 ? job.avgTime : 0;
  if (!avgTime) return { value: null, detail: `${formatSeconds(elapsed)} elapsed` };
  const percent = Math.min(95, Math.max(2, Math.round((elapsed / avgTime) * 100)));
  const remaining = Math.max(0, Math.ceil(avgTime - elapsed));
  return { value: percent / 100, detail: remaining > 0 ? `~${remaining}s` : "Taking longer than expected..." };
}
