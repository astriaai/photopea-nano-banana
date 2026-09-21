// One generation job, from capture to placement. The controller snapshots
// the composer into `JobInput` when the user submits, so later UI changes
// cannot alter a job in flight. Generation success is separate from placement
// success: once images are downloaded they are handed back as a retained
// result before placement starts, so a placement failure never costs another
// generation.

import { timingFor, type CatalogModel } from "../domain/catalog";
import { CancelledError } from "../domain/errors";
import { acceptsReferences, buildPromptRequest } from "../domain/request";
import { captureForGeneration } from "../host/capture";
import { placeResults, PlacementError, type PlacementOutcome } from "../host/placement";
import { layerName } from "../host/photopea/scripts";
import type { Host } from "../host/types";
import { AstriaApi, downloadImage } from "../services/astria/api";
import type { Credentials } from "../services/astria/client";
import type { JobStage, RetainedResult } from "./state";

export type JobInput = {
  jobId: number;
  model: CatalogModel;
  prompt: string;
  preserve: boolean;
  count: number;
  resolution: string;
  quality: string;
  useForeground: boolean;
  references: Blob[];
};

export type JobProgress = {
  stage: JobStage;
  cancellable: boolean;
  startedAt?: number;
  avgTime?: number;
  timeout?: number;
  current?: number;
  total?: number;
};

export type JobDeps = {
  api: AstriaApi;
  host: Host;
  credentials: Credentials;
  signal: AbortSignal;
  report: (progress: JobProgress) => void;
  /** Called as soon as images exist, before placement, so they survive a placement failure. */
  retain: (result: RetainedResult) => void;
};

export type JobOutcome = {
  result: RetainedResult;
  placement: PlacementOutcome;
  warnings: string[];
};

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new CancelledError();
}

export async function runGeneration(deps: JobDeps, input: JobInput): Promise<JobOutcome> {
  const { api, host, credentials, signal } = deps;
  const { model } = input;
  const warnings: string[] = [];

  if (input.references.length > 0 && !acceptsReferences(model)) {
    throw new Error(`${model.title} does not take reference images. Remove them or choose another model.`);
  }

  deps.report({ stage: "capturing", cancellable: true });
  const capture = await captureForGeneration(host, model);
  throwIfCancelled(signal);

  deps.report({ stage: "submitting", cancellable: true });
  const request = buildPromptRequest({
    model,
    prompt: input.prompt,
    foregroundHex: input.useForeground ? capture.foregroundHex : null,
    preserve: input.preserve,
    count: input.count,
    resolution: input.resolution,
    quality: input.quality,
    hasInputImage: true,
    aspectRatio: capture.aspectRatio
  });
  let tuneId = model.id;
  if (input.references.length > 0) {
    const tune = await api.createReferenceTune(credentials, model.id, input.references, signal);
    tuneId = tune.id;
  }
  throwIfCancelled(signal);
  const created = await api.createPrompt(credentials, tuneId, request.fields, { inputImage: capture.image, maskImage: capture.maskBlob }, signal);
  if (credentials.workspaceId && created.workspaceId !== credentials.workspaceId) {
    warnings.push("It was generated in Personal: the selected workspace is no longer accessible.");
  }

  const timing = timingFor(model, input.resolution);
  deps.report({ stage: "generating", cancellable: true, startedAt: Date.now(), avgTime: timing.avgTime, timeout: timing.timeout });
  const finished = await api.pollPrompt(credentials, created.id, { timeoutSeconds: timing.timeout, signal });

  deps.report({ stage: "downloading", cancellable: true });
  const images: Blob[] = [];
  for (const url of finished.images) {
    throwIfCancelled(signal);
    images.push(await downloadImage(api.client, url, signal));
  }

  const result: RetainedResult = {
    jobId: input.jobId,
    promptId: finished.id,
    images,
    placed: [],
    destination: capture.destination,
    capture: capture.capture,
    selection: capture.selection,
    maskCanvas: capture.maskCanvas,
    layerName: layerName(request.displayText, model.title),
    modelTitle: model.title
  };
  deps.retain(result);

  deps.report({ stage: "placing", cancellable: false, total: images.length });
  const placement = await placeRetained(host, result, (current, total) => deps.report({ stage: "placing", cancellable: false, current, total }));
  return { result, placement, warnings: [...warnings, ...placement.warnings] };
}

/** Places whatever of a retained result is not placed yet; records what landed even when a later image fails. */
export async function placeRetained(host: Host, result: RetainedResult, onProgress?: (current: number, total: number) => void): Promise<PlacementOutcome> {
  const pending = result.images.map((image, index) => ({ image, index })).filter(({ index }) => !result.placed.includes(index));
  const markPlaced = (count: number) => {
    for (const { index } of pending.slice(0, count)) if (!result.placed.includes(index)) result.placed.push(index);
  };
  try {
    const outcome = await placeResults(host, {
      destination: result.destination,
      capture: result.capture,
      selection: result.selection,
      maskCanvas: result.maskCanvas,
      images: pending.map(({ image }) => image),
      layerName: result.layerName,
      onProgress
    });
    markPlaced(outcome.placedLayerIds.length);
    return outcome;
  } catch (error) {
    if (error instanceof PlacementError) markPlaced(error.placedLayerIds.length);
    throw error;
  }
}
