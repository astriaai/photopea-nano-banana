// The backend contract the plugin depends on (sdbooth): the plugin catalog,
// the account and its payer, workspaces, prompt creation under a tune,
// polling, and reference tunes.

import { normalizeCatalog, type Catalog } from "../../domain/catalog";
import { ApiError, CancelledError } from "../../domain/errors";
import type { PromptFields } from "../../domain/request";
import { AstriaClient, type Credentials } from "./client";

export type Payer = { name: string; self: boolean; usdBalanceMc: number };

export type Account = {
  email: string;
  name: string;
  usdBalanceMc: number;
  payer: Payer;
};

export type Workspace = { id: string; title: string; faviconUrl: string; slug: string };

export type PromptRecord = {
  id: number;
  trainedAt: string | null;
  userError: string | null;
  images: string[];
  workspaceId: string;
  tuneId: number | null;
};

export type ReferenceTune = { id: number; title: string };

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

export function parseAccount(value: unknown): Account {
  const json = asObject(value);
  const payerJson = asObject(json.payer);
  const own = Number(json.usd_balance_mc) || 0;
  const hasPayer = Object.keys(payerJson).length > 0;
  return {
    email: String(json.email ?? ""),
    name: String(json.name ?? ""),
    usdBalanceMc: own,
    payer: hasPayer
      ? { name: String(payerJson.name ?? ""), self: payerJson.self !== false, usdBalanceMc: Number(payerJson.usd_balance_mc) || 0 }
      : { name: "", self: true, usdBalanceMc: own }
  };
}

export function parseWorkspaces(value: unknown): Workspace[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      const json = asObject(row);
      return {
        id: json.id != null ? String(json.id) : "",
        title: String(json.title ?? "").trim(),
        faviconUrl: typeof json.favicon_url === "string" ? json.favicon_url : "",
        slug: String(json.slug ?? "")
      };
    })
    .filter((workspace) => workspace.id && workspace.title);
}

export function parsePrompt(value: unknown): PromptRecord {
  const json = asObject(value);
  const id = Number(json.id);
  if (!Number.isFinite(id)) throw new ApiError(0, JSON.stringify(value), "astria.ai did not return the prompt.");
  return {
    id,
    trainedAt: typeof json.trained_at === "string" ? json.trained_at : null,
    userError: typeof json.user_error === "string" && json.user_error ? json.user_error : null,
    images: Array.isArray(json.images) ? json.images.filter((item): item is string => typeof item === "string") : [],
    workspaceId: json.workspace_id != null ? String(json.workspace_id) : "",
    tuneId: Number.isFinite(Number(json.tune_id)) ? Number(json.tune_id) : null
  };
}

export function formatBalance(usdBalanceMc: number): string {
  return `$${(usdBalanceMc / 100_000).toFixed(2)}`;
}

/** Below this the panel refuses to start a job (4,000 mc = $0.04). */
export const MIN_BALANCE_MC = 4_000;

export type PollOptions = {
  /** Seconds to keep polling before giving up. */
  timeoutSeconds: number;
  signal?: AbortSignal;
  onTick?: (elapsedSeconds: number) => void;
};

export class AstriaApi {
  readonly client: AstriaClient;

  constructor(client: AstriaClient) {
    this.client = client;
  }

  async fetchCatalog(credentials: Credentials): Promise<Catalog> {
    return normalizeCatalog(await this.client.request("plugin/models", credentials));
  }

  async fetchAccount(credentials: Credentials): Promise<Account> {
    return parseAccount(await this.client.request("users", credentials));
  }

  async fetchWorkspaces(credentials: Credentials): Promise<Workspace[]> {
    return parseWorkspaces(await this.client.request("workspaces.json", { apiKey: credentials.apiKey }));
  }

  /** Creates a temporary faceid tune holding the reference images; the prompt is then created under it. */
  async createReferenceTune(credentials: Credentials, baseTuneId: number, images: Blob[], signal?: AbortSignal): Promise<ReferenceTune> {
    const form = new FormData();
    form.append("tune[name]", "subject");
    form.append("tune[title]", `subject ${Date.now()}`);
    form.append("tune[model_type]", "faceid");
    form.append("tune[base_tune_id]", String(baseTuneId));
    images.forEach((image, index) => form.append("tune[images][]", image, `reference-${index + 1}.${extensionOf(image)}`));
    const json = asObject(await this.client.request("tunes", credentials, { method: "POST", body: form, signal }));
    const id = Number(json.id);
    if (!Number.isFinite(id)) throw new ApiError(0, JSON.stringify(json), "astria.ai did not return the reference tune.");
    return { id, title: String(json.title ?? "") };
  }

  async createPrompt(credentials: Credentials, tuneId: number, fields: PromptFields, files: { inputImage?: Blob | null; maskImage?: Blob | null }, signal?: AbortSignal): Promise<PromptRecord> {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(`prompt[${key}]`, value);
    if (files.inputImage) form.append("prompt[input_image]", files.inputImage, `image.${extensionOf(files.inputImage)}`);
    if (files.maskImage) form.append("prompt[mask_image]", files.maskImage, "mask.png");
    return parsePrompt(await this.client.request(`tunes/${tuneId}/prompts`, credentials, { method: "POST", body: form, signal }));
  }

  async fetchPrompt(credentials: Credentials, id: number, signal?: AbortSignal): Promise<PromptRecord> {
    return parsePrompt(await this.client.request(`prompts/${id}`, { apiKey: credentials.apiKey }, { signal }));
  }

  /** Polls until the prompt finishes, fails, is cancelled or the timeout passes. */
  async pollPrompt(credentials: Credentials, id: number, options: PollOptions): Promise<PromptRecord> {
    const started = Date.now();
    const deadline = started + options.timeoutSeconds * 1000;
    let interval = 1000;
    for (;;) {
      if (options.signal?.aborted) throw new CancelledError();
      const prompt = await this.fetchPrompt(credentials, id, options.signal);
      if (prompt.trainedAt) {
        if (prompt.userError) throw new ApiError(0, "", prompt.userError);
        if (prompt.images.length === 0) throw new ApiError(0, "", "The generation finished without any image.");
        return prompt;
      }
      const elapsed = (Date.now() - started) / 1000;
      options.onTick?.(elapsed);
      if (Date.now() >= deadline) {
        throw new ApiError(0, "", "The generation is taking longer than expected. Check astria.ai for the result; nothing was placed.");
      }
      await sleep(interval, options.signal);
      if (elapsed > 30) interval = 2000;
    }
  }

  async deletePrompt(credentials: Credentials, id: number): Promise<void> {
    await this.client.request(`prompts/${id}`, { apiKey: credentials.apiKey }, { method: "DELETE" });
  }

  async deleteTune(credentials: Credentials, id: number): Promise<void> {
    await this.client.request(`tunes/${id}`, { apiKey: credentials.apiKey }, { method: "DELETE" });
  }
}

/** Downloads a result image through the client's fetch; the CDN allows cross-origin GETs. Retries transient failures. */
export async function downloadImage(client: AstriaClient, url: string, signal?: AbortSignal, attempts = 5): Promise<Blob> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) throw new CancelledError();
    try {
      const response = await client.fetchRaw(url, { signal, cache: "no-store", credentials: "omit" });
      if (response.ok) return await response.blob();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new CancelledError();
      lastError = error;
    }
    await sleep(1500 * attempt, signal);
  }
  throw new ApiError(0, "", `The generated image could not be downloaded (${lastError instanceof Error ? lastError.message : "network error"}). It is still available on astria.ai.`);
}

function extensionOf(blob: Blob): string {
  if (blob.type === "image/jpeg") return "jpg";
  if (blob.type === "image/webp") return "webp";
  if (blob.type === "image/gif") return "gif";
  return "png";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError());
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new CancelledError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
