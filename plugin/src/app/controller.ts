// The application controller: owns the store, the host, the API client and
// the storage, and exposes the actions the UI calls. React reads the store;
// only this file changes it.

import { findModel, resolveModelKey, resolveOption, type CatalogModel } from "../domain/catalog";
import { AuthorizationError, CancelledError, InsufficientBalanceError, errorMessage, isBalanceError } from "../domain/errors";
import { clearUnstarred, removePrompt, reusePrompt, setStarred } from "../domain/history";
import { decodeImage, makeThumbnail, trimTransparent, canvasToBlob, createCanvas } from "../domain/image";
import { canSubmit } from "../domain/request";
import { PlacementError, cleanupTempLayers } from "../host/placement";
import { HostError, type Host } from "../host/types";
import { AstriaApi, MIN_BALANCE_MC, formatBalance, type Account } from "../services/astria/api";
import type { Credentials } from "../services/astria/client";
import { addBalanceUrl, apiKeyPageUrl, openExternal } from "../services/astria/links";
import type { PluginStorage } from "../storage/storage";
import { placeRetained, runGeneration, type JobProgress } from "./generation";
import { initialState, type AppState, type ReferenceItem, type RetainedResult } from "./state";
import { createStore, type Store } from "./store";

export const MAX_REFERENCES = 8;
export const MAX_REFERENCE_BYTES = 40 * 1024 * 1024;
export const ACCEPTED_REFERENCE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export type ControllerDeps = {
  version: string;
  host: Host;
  hostStatus: AppState["host"];
  hostMessage?: string;
  api: AstriaApi;
  storage: PluginStorage;
  mockBackend?: boolean;
};

export class AppController {
  readonly store: Store<AppState>;
  private host: Host;
  private api: AstriaApi;
  private storage: PluginStorage;
  private apiKey = "";
  private jobSequence = 0;
  private abort: AbortController | null = null;
  private referenceSequence = 0;
  private connectSequence = 0;

  constructor(deps: ControllerDeps) {
    this.host = deps.host;
    this.api = deps.api;
    this.storage = deps.storage;
    const persisted = deps.storage.get();
    const state = initialState(deps.version, deps.storage.persistent);
    state.host = deps.hostStatus;
    state.hostMessage = deps.hostMessage ?? "";
    state.mockBackend = deps.mockBackend === true;
    state.history = persisted.history;
    state.composer.count = persisted.count;
    state.composer.useForeground = persisted.useForeground;
    this.store = createStore(state);
    this.apiKey = persisted.apiKey;
  }

  get state(): AppState {
    return this.store.get();
  }

  private credentials(workspaceId = this.state.workspaces.selectedId): Credentials {
    return { apiKey: this.apiKey, workspaceId };
  }

  private notify(message: string): void {
    this.store.set({ notice: message });
  }

  dismissNotice(): void {
    this.store.set({ notice: "" });
  }

  // ---------------------------------------------------------------- session

  async boot(): Promise<void> {
    if (this.state.host === "ready" || this.state.host === "fixture") {
      void this.refreshInspection();
    }
    if (this.apiKey) await this.connect(this.apiKey);
    else this.store.set({ session: "signed-out" });
  }

  /** Validates the key against the account endpoint before anything else is loaded. */
  async connect(apiKey: string): Promise<void> {
    const key = apiKey.trim();
    if (!key) throw new Error("Paste your Astria API key.");
    if (!key.startsWith("sd_")) throw new Error("An Astria API key starts with sd_. Open astria.ai to copy it.");
    const attempt = ++this.connectSequence;
    this.store.set({ session: "connecting", sessionError: "", initializationError: "", notice: "" });
    let account: Account;
    try {
      account = await this.api.fetchAccount({ apiKey: key });
    } catch (error) {
      if (attempt !== this.connectSequence) return;
      const message = error instanceof AuthorizationError ? "That API key was rejected. Check it on astria.ai and try again." : errorMessage(error);
      this.apiKey = "";
      this.storage.signOut();
      this.store.set({ session: "signed-out", sessionError: message, account: null });
      throw new Error(message);
    }
    if (attempt !== this.connectSequence) return;
    this.apiKey = key;
    this.storage.update({ apiKey: key });
    this.store.set({ account });
    await this.loadWorkspaces({ restore: true });
    if (attempt !== this.connectSequence) return;
    // The remembered workspace decides whose balance is shown.
    if (this.state.workspaces.selectedId) await this.refreshBalance({ quiet: true });
    await this.loadCatalog();
    if (attempt !== this.connectSequence) return;
    this.store.set({ session: "ready" });
  }

  async loadCatalog(): Promise<void> {
    try {
      const catalog = await this.api.fetchCatalog(this.credentials());
      const persisted = this.storage.get();
      const modelKey = resolveModelKey(catalog, persisted.modelKey);
      this.store.set({ catalog, initializationError: "" });
      this.applyModel(modelKey);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        this.signOut("Your Astria API key was rejected. Sign in again.");
        return;
      }
      this.store.set({ initializationError: `Failed to load the models: ${errorMessage(error)}` });
    }
  }

  async retryInitialization(): Promise<void> {
    if (!this.apiKey) return;
    this.store.set({ initializationError: "" });
    await this.loadCatalog();
    if (!this.state.account) {
      try {
        await this.refreshBalance({ quiet: true });
      } catch {
        // The catalog error, if any, is shown; balance stays unknown.
      }
    }
  }

  signOut(message = ""): void {
    if (this.state.job.status === "working") {
      this.notify("Wait for the current generation to finish before signing out.");
      return;
    }
    this.connectSequence++;
    this.apiKey = "";
    this.storage.signOut();
    this.clearReferences();
    this.store.set({
      session: "signed-out",
      sessionError: message,
      account: null,
      catalog: null,
      workspaces: { list: [], selectedId: "", status: "idle", error: "", favicons: {} },
      initializationError: "",
      retained: null,
      job: { status: "idle" },
      notice: ""
    });
  }

  openApiKeyPage(): void {
    openExternal(apiKeyPageUrl());
  }

  openAddBalance(): void {
    openExternal(addBalanceUrl());
  }

  // ---------------------------------------------------------------- account

  async refreshBalance(options: { quiet?: boolean } = {}): Promise<void> {
    try {
      const account = await this.api.fetchAccount(this.credentials());
      this.store.set({ account });
    } catch (error) {
      if (error instanceof AuthorizationError) {
        this.signOut("Your Astria API key was rejected. Sign in again.");
        return;
      }
      if (!options.quiet) this.notify(`Refresh balance failed: ${errorMessage(error)}`);
    }
  }

  async loadWorkspaces(options: { restore?: boolean } = {}): Promise<void> {
    const current = this.state.workspaces;
    this.store.set({ workspaces: { ...current, status: "loading", error: "" } });
    try {
      const list = await this.api.fetchWorkspaces(this.credentials());
      const wanted = options.restore ? this.storage.get().workspaceId : current.selectedId;
      const selectedId = list.some((workspace) => workspace.id === wanted) ? wanted : "";
      this.store.set({ workspaces: { ...this.state.workspaces, list, selectedId, status: "ready", error: "" } });
      void this.loadFavicons(list.map((workspace) => workspace.faviconUrl).filter(Boolean));
    } catch (error) {
      if (error instanceof AuthorizationError) {
        this.signOut("Your Astria API key was rejected. Sign in again.");
        return;
      }
      this.store.set({ workspaces: { ...this.state.workspaces, status: "error", error: "Failed to load workspaces. Reopen the list to retry." } });
    }
  }

  private async loadFavicons(urls: string[]): Promise<void> {
    const missing = urls.filter((url) => !(url in this.state.workspaces.favicons));
    if (!missing.length) return;
    const entries = await Promise.all(missing.map(async (url) => {
      try {
        const response = await fetch(url, { credentials: "omit" });
        if (!response.ok) return [url, ""] as const;
        const blob = await response.blob();
        if (!blob.type.startsWith("image/") || blob.size > 100 * 1024) return [url, ""] as const;
        return [url, await makeThumbnail(blob, 32)] as const;
      } catch {
        return [url, ""] as const;
      }
    }));
    const favicons = { ...this.state.workspaces.favicons };
    for (const [url, data] of entries) favicons[url] = data;
    this.store.set({ workspaces: { ...this.state.workspaces, favicons } });
  }

  async setWorkspace(id: string): Promise<void> {
    if (this.state.job.status === "working") {
      this.notify("Wait for the current generation to finish before switching workspace.");
      return;
    }
    const value = String(id || "");
    if (value && !this.state.workspaces.list.some((workspace) => workspace.id === value)) {
      this.notify("That workspace is no longer available.");
      return;
    }
    this.store.set({ workspaces: { ...this.state.workspaces, selectedId: value } });
    this.storage.update({ workspaceId: value });
    await this.refreshBalance();
  }

  // --------------------------------------------------------------- composer

  setPrompt(value: string): void {
    this.store.set({ composer: { ...this.state.composer, prompt: value } });
  }

  private applyModel(modelKey: string): void {
    const model = findModel(this.state.catalog, modelKey);
    if (!model) return;
    const saved = this.storage.get().optionsByModel[modelKey] || {};
    const composer = this.state.composer;
    const count = model.fields.numImages ? composer.count : "1";
    this.store.set({
      composer: {
        ...composer,
        modelKey,
        count,
        resolution: resolveOption(model.resolutions, saved.resolution, model.defaultResolution),
        quality: resolveOption(model.qualities, saved.quality, model.defaultQuality)
      }
    });
    this.storage.update({ modelKey });
  }

  setModel(modelKey: string): void {
    if (this.state.job.status === "working") return;
    this.applyModel(modelKey);
  }

  setCount(value: string): void {
    const counts = this.state.catalog?.counts ?? ["1"];
    const count = counts.includes(value) ? value : "1";
    this.store.set({ composer: { ...this.state.composer, count } });
    this.storage.update({ count });
  }

  private saveModelOption(patch: { resolution?: string; quality?: string }): void {
    const { modelKey } = this.state.composer;
    const optionsByModel = { ...this.storage.get().optionsByModel, [modelKey]: { ...this.storage.get().optionsByModel[modelKey], ...patch } };
    this.storage.update({ optionsByModel });
  }

  setResolution(value: string): void {
    const model = this.selectedModel();
    if (!model || !model.resolutions.includes(value)) return;
    this.store.set({ composer: { ...this.state.composer, resolution: value } });
    this.saveModelOption({ resolution: value });
  }

  setQuality(value: string): void {
    const model = this.selectedModel();
    if (!model || !model.qualities.includes(value)) return;
    this.store.set({ composer: { ...this.state.composer, quality: value } });
    this.saveModelOption({ quality: value });
  }

  toggleForeground(): void {
    const useForeground = !this.state.composer.useForeground;
    this.store.set({ composer: { ...this.state.composer, useForeground } });
    this.storage.update({ useForeground });
  }

  selectedModel(): CatalogModel | null {
    return findModel(this.state.catalog, this.state.composer.modelKey);
  }

  // ------------------------------------------------------------- references

  private async pushReference(kind: ReferenceItem["kind"], name: string, blob: Blob): Promise<void> {
    const preview = await makeThumbnail(blob, 160);
    const item: ReferenceItem = { id: `${kind}-${++this.referenceSequence}`, kind, name, blob, preview };
    this.store.set({ composer: { ...this.state.composer, references: [...this.state.composer.references, item] } });
  }

  async addFileReferences(files: File[]): Promise<void> {
    const errors: string[] = [];
    for (const file of files) {
      if (this.state.composer.references.length >= MAX_REFERENCES) {
        errors.push(`At most ${MAX_REFERENCES} reference images.`);
        break;
      }
      if (!ACCEPTED_REFERENCE_TYPES.includes(file.type)) {
        errors.push(`${file.name} is not a PNG, JPEG or WebP image.`);
        continue;
      }
      if (file.size > MAX_REFERENCE_BYTES) {
        errors.push(`${file.name} is larger than ${Math.round(MAX_REFERENCE_BYTES / 1024 / 1024)} MB.`);
        continue;
      }
      try {
        await this.pushReference("file", file.name, file);
      } catch (error) {
        errors.push(`${file.name}: ${errorMessage(error)}`);
      }
    }
    if (errors.length) throw new Error(errors.join(" "));
  }

  /** The active Photopea layer, trimmed to its opaque pixels, as a PNG reference. */
  async addLayerReference(): Promise<void> {
    if (this.state.composer.references.length >= MAX_REFERENCES) throw new Error(`At most ${MAX_REFERENCES} reference images.`);
    const { bytes, name } = await this.host.exportActiveLayer();
    const image = await decodeImage(bytes);
    let trimmed: HTMLCanvasElement;
    try {
      const canvas = createCanvas({ width: image.width, height: image.height });
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      trimmed = trimTransparent(canvas);
    } finally {
      image.close();
    }
    const blob = await canvasToBlob(trimmed, "image/png");
    await this.pushReference("layer", name || "Layer", blob);
  }

  removeReference(id: string): void {
    this.store.set({ composer: { ...this.state.composer, references: this.state.composer.references.filter((item) => item.id !== id) } });
  }

  clearReferences(): void {
    this.store.set({ composer: { ...this.state.composer, references: [] } });
  }

  // ---------------------------------------------------------------- history

  private saveHistory(history: AppState["history"]): void {
    this.store.set({ history });
    this.storage.update({ history });
  }

  reusePrompt(text: string): void {
    this.saveHistory(reusePrompt(this.state.history, text));
    this.setPrompt(text);
  }

  setPromptStarred(text: string, starred: boolean): void {
    this.saveHistory(setStarred(this.state.history, text, starred));
  }

  removePrompt(text: string): void {
    this.saveHistory(removePrompt(this.state.history, text));
  }

  clearPrompts(): void {
    this.saveHistory(clearUnstarred(this.state.history));
  }

  // ------------------------------------------------------------------- host

  async refreshInspection(): Promise<void> {
    if (this.state.host !== "ready" && this.state.host !== "fixture") return;
    if (this.state.job.status === "working") return;
    try {
      const inspection = await this.host.inspect();
      this.store.set({ inspection });
    } catch (error) {
      if (error instanceof HostError && (error.code === "timeout" || error.code === "unavailable")) {
        this.store.set({ host: "unavailable", hostMessage: error.message });
      }
    }
  }

  // ------------------------------------------------------------- generation

  canGenerate(): boolean {
    const model = this.selectedModel();
    return this.state.session === "ready" && this.state.job.status !== "working" && canSubmit(model, this.state.composer.prompt);
  }

  private reportJob(jobId: number, model: string, progress: JobProgress): void {
    const job = this.state.job;
    if (job.status === "working" && job.jobId !== jobId) return;
    this.store.set({
      job: {
        status: "working",
        jobId,
        stage: progress.stage,
        model,
        startedAt: progress.startedAt ?? (job.status === "working" && job.stage === progress.stage ? job.startedAt : undefined),
        avgTime: progress.avgTime,
        timeout: progress.timeout,
        progress: progress.progress,
        cancellable: progress.cancellable && !(job.status === "working" && job.cancelling),
        cancelling: job.status === "working" ? job.cancelling && progress.cancellable : false,
        current: progress.current,
        total: progress.total
      }
    });
  }

  async generate(options: { preserve?: boolean } = {}): Promise<void> {
    if (!this.canGenerate()) return;
    // A fresh look at the document, so the note about a missing one is current.
    await this.refreshInspection();
    if (!this.canGenerate()) return;
    const model = this.selectedModel();
    const account = this.state.account;
    if (!model) return;
    const jobId = ++this.jobSequence;
    const { composer, workspaces } = this.state;
    const credentials = this.credentials(workspaces.selectedId);
    const input = {
      jobId,
      model,
      prompt: composer.prompt.trim(),
      preserve: options.preserve ?? true,
      count: Number(composer.count) || 1,
      resolution: composer.resolution,
      quality: composer.quality,
      useForeground: composer.useForeground,
      references: composer.references.map((item) => item.blob)
    };
    const abort = new AbortController();
    this.abort = abort;
    this.store.set({ notice: "", retained: null, job: { status: "working", jobId, stage: "capturing", model: model.title, cancellable: true, cancelling: false } });
    if (model.fields.prompt && input.prompt) this.saveHistory(reusePrompt(this.state.history, input.prompt));

    try {
      if (account && account.payer.usdBalanceMc < MIN_BALANCE_MC) {
        await this.refreshBalance({ quiet: true });
        const refreshed = this.state.account;
        if (refreshed && refreshed.payer.usdBalanceMc < MIN_BALANCE_MC) {
          throw new InsufficientBalanceError(refreshed.payer.self
            ? "Not enough balance in your account. Add balance on astria.ai and try again."
            : `Not enough balance in the workspace, which is billed to ${refreshed.payer.name || "its owner"}.`);
        }
      }
      const outcome = await runGeneration({
        api: this.api,
        host: this.host,
        credentials,
        signal: abort.signal,
        report: (progress) => this.reportJob(jobId, model.title, progress),
        retain: (result) => this.store.set({ retained: result })
      }, input);
      const allPlaced = outcome.result.placed.length === outcome.result.images.length;
      this.store.set({
        retained: allPlaced ? null : outcome.result,
        job: { status: "succeeded", jobId, images: outcome.placement.placedLayerIds.length, warnings: outcome.warnings, message: outcome.placement.maskMode === "baked" ? "The selection was applied to the image itself." : undefined }
      });
    } catch (error) {
      this.finishFailedJob(jobId, error);
    } finally {
      if (this.abort === abort) this.abort = null;
      void this.refreshBalance({ quiet: true });
      void this.refreshInspection();
    }
  }

  private finishFailedJob(jobId: number, error: unknown): void {
    const retained = this.state.retained;
    if (error instanceof CancelledError) {
      this.store.set({ job: { status: "cancelled", jobId, message: "Stopped waiting. If astria.ai still finishes this generation, it stays in your account and is billed." } });
      return;
    }
    if (error instanceof AuthorizationError) {
      this.signOut(error.message);
      return;
    }
    let message = errorMessage(error);
    if (isBalanceError(message)) message = "Not enough balance in the account. Add balance on astria.ai and try again.";
    const retainable = retained !== null && retained.jobId === jobId && retained.placed.length < retained.images.length;
    if (error instanceof PlacementError) message = `The image was generated but could not be placed: ${message}`;
    this.store.set({ job: { status: "failed", jobId, message: message.slice(0, 400), retainable } });
  }

  cancelGeneration(): void {
    const job = this.state.job;
    if (job.status !== "working" || !job.cancellable || !this.abort) return;
    this.store.set({ job: { ...job, cancelling: true, cancellable: false } });
    this.abort.abort();
  }

  /** Places the images of the last generation that are still unplaced, without generating again. */
  async retryPlacement(): Promise<void> {
    const retained = this.state.retained;
    if (!retained || this.state.job.status === "working") return;
    const jobId = retained.jobId;
    this.store.set({ job: { status: "working", jobId, stage: "placing", model: retained.modelTitle, cancellable: false, cancelling: false, total: retained.images.length - retained.placed.length } });
    try {
      const outcome = await placeRetained(this.host, retained, (current, total) => this.reportJob(jobId, retained.modelTitle, { stage: "placing", cancellable: false, current, total }));
      const allPlaced = retained.placed.length === retained.images.length;
      this.store.set({ retained: allPlaced ? null : retained, job: { status: "succeeded", jobId, images: outcome.placedLayerIds.length, warnings: outcome.warnings } });
    } catch (error) {
      this.finishFailedJob(jobId, error);
    } finally {
      void this.refreshInspection();
    }
  }

  /** Saves the retained images through the browser's download, for when placement keeps failing. */
  downloadRetained(): void {
    const retained = this.state.retained;
    if (!retained) return;
    retained.images.forEach((image, index) => {
      const url = URL.createObjectURL(image);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${retained.layerName.replace(/[^\w-]+/g, "_").slice(0, 40) || "astria"}-${index + 1}.${image.type === "image/png" ? "png" : "jpg"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    });
  }

  discardRetained(): void {
    this.store.set({ retained: null, job: { status: "idle" } });
  }

  async cleanupHost(): Promise<void> {
    await cleanupTempLayers(this.host);
    void this.refreshInspection();
  }

  balanceLabel(): string {
    const account = this.state.account;
    return account ? formatBalance(account.payer.usdBalanceMc) : "";
  }
}

export type { RetainedResult };
