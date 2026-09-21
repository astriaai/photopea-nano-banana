// Adapted from the Photoshop plugin's WorkingStatus / GenerationStatus
// (App.tsx, commit ffe30c1b), with placement recovery for retained results.
import * as React from "react";
import { Check, Download, RefreshCw, X } from "lucide-react";
import { useAction, useAppState, useController } from "../../app/hooks";
import type { JobState } from "../../app/state";
import { Button } from "../../components/ui/button";
import { estimateProgress, stageLabel } from "../../lib/progress";
import { cn } from "../../lib/utils";

function ProgressBar({ value }: { value: number | null }) {
  const percent = value === null ? undefined : Math.round(value * 100);
  return (
    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div
        className={cn("h-full rounded-full bg-primary", value === null ? "progress-indeterminate" : "transition-[width] duration-300 ease-linear")}
        style={value === null ? undefined : { width: `${percent}%` }}
      />
    </div>
  );
}

function WorkingStatus({ job }: { job: Extract<JobState, { status: "working" }> }) {
  const controller = useController();
  const [now, setNow] = React.useState(() => Date.now());
  const ticking = job.stage === "generating" && Boolean(job.startedAt);

  React.useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [ticking, job.startedAt]);

  const progress = estimateProgress(job, now);
  return (
    <div className="mx-3 mb-2 rounded-lg bg-white/5 px-3 py-2 text-[11px] text-muted-foreground" role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        <RefreshCw className="size-3.5 shrink-0 animate-spin" />
        <span className="min-w-0 flex-1 truncate">{stageLabel(job)}</span>
        {job.cancellable && (
          <Button size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-[11px]" disabled={job.cancelling} onClick={() => controller.cancelGeneration()}>
            Stop
          </Button>
        )}
      </div>
      <ProgressBar value={progress.value} />
      {progress.detail && <p className="mt-1 truncate text-[10px] text-muted-foreground/80">{progress.detail}</p>}
    </div>
  );
}

function RetainedActions() {
  const controller = useController();
  const run = useAction();
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button size="sm" variant="secondary" className="h-6 px-2 text-[11px]" onClick={() => run("Placing again", () => controller.retryPlacement())}>
        <RefreshCw className="size-3" />Place again
      </Button>
      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => controller.downloadRetained()} title="Save the generated images to your computer">
        <Download className="size-3" />Download
      </Button>
      <button type="button" className="text-current/70 hover:text-current" aria-label="Discard the generated images" onClick={() => controller.discardRetained()}>
        <X className="size-3.5" />
      </button>
    </span>
  );
}

export function GenerationStatus() {
  const controller = useController();
  const state = useAppState();
  const { job, retained } = state;

  if (state.initializationError && !state.catalog) {
    return (
      <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-red-400/20 bg-red-500/8 px-3 py-2">
        <p className="min-w-0 flex-1 text-[11px] leading-4 text-red-200">{state.initializationError}</p>
        <Button size="sm" variant="secondary" onClick={() => void controller.retryInitialization()}>Try again</Button>
      </div>
    );
  }

  if (job.status === "working") return <WorkingStatus job={job} />;

  if (job.status === "cancelled") {
    return <div className="mx-3 mb-2 rounded-lg bg-white/5 px-3 py-2 text-[11px] leading-4 text-muted-foreground">{job.message}</div>;
  }

  if (job.status === "succeeded") {
    const unplaced = retained ? retained.images.length - retained.placed.length : 0;
    return (
      <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] leading-4 text-emerald-200" role="status">
        <Check className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">
          {job.images === 1 ? "Result added to Photopea as a masked smart object." : `Added ${job.images} smart objects to Photopea.`}
          {job.warnings.length > 0 && <span className="text-amber-200"> {job.warnings.join(" ")}</span>}
          {unplaced > 0 && <span className="text-amber-200"> {unplaced} of the images are not placed yet.</span>}
        </span>
        {unplaced > 0 && <RetainedActions />}
      </div>
    );
  }

  if (job.status === "failed") {
    return (
      <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-red-400/20 bg-red-500/8 px-3 py-2 text-[11px] leading-4 text-red-200" role="alert">
        <span className="min-w-0 flex-1">{job.message}</span>
        {job.retainable && retained && <RetainedActions />}
      </div>
    );
  }

  return null;
}
