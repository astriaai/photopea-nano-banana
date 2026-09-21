import type { Catalog } from "../domain/catalog";
import type { Bounds } from "../domain/geometry";
import type { HistoryEntry } from "../domain/history";
import type { DocumentIdentity, HostInspection } from "../host/types";
import type { Account, Workspace } from "../services/astria/api";

export type SessionStatus = "booting" | "signed-out" | "connecting" | "ready" | "error";

export type HostStatus = "connecting" | "ready" | "unavailable" | "not-embedded" | "fixture";

export type ReferenceItem = {
  id: string;
  kind: "file" | "layer";
  name: string;
  blob: Blob;
  /** Data URL thumbnail. */
  preview: string;
};

export type JobStage = "capturing" | "submitting" | "generating" | "downloading" | "placing";

export const STAGE_ORDER: JobStage[] = ["capturing", "submitting", "generating", "downloading", "placing"];

/** A finished generation whose images are kept until placed, so placement can be retried without paying again. */
export type RetainedResult = {
  jobId: number;
  promptId: number;
  images: Blob[];
  /** Images already placed (indexes into `images`). */
  placed: number[];
  destination: DocumentIdentity;
  capture: Bounds;
  selection: Bounds | null;
  maskCanvas: HTMLCanvasElement | null;
  layerName: string;
  modelTitle: string;
};

export type JobState =
  | { status: "idle" }
  | {
      status: "working";
      jobId: number;
      stage: JobStage;
      model: string;
      /** When the provider request started; drives the time estimate. */
      startedAt?: number;
      avgTime?: number;
      timeout?: number;
      cancellable: boolean;
      cancelling: boolean;
      current?: number;
      total?: number;
    }
  | { status: "succeeded"; jobId: number; images: number; message?: string; warnings: string[] }
  | { status: "failed"; jobId: number; message: string; /** True when images exist and only placement failed. */ retainable: boolean }
  | { status: "cancelled"; jobId: number; message: string };

export type WorkspacesState = {
  list: Workspace[];
  selectedId: string;
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  /** Favicon data URLs by workspace id. */
  favicons: Record<string, string>;
};

export type AppState = {
  version: string;
  host: HostStatus;
  hostMessage: string;
  /** True when `?mock=1` replaced api.astria.ai with the local fake. */
  mockBackend: boolean;
  storagePersistent: boolean;
  session: SessionStatus;
  sessionError: string;
  /** Set when the catalog could not be loaded; the composer shows a retry. */
  initializationError: string;
  account: Account | null;
  catalog: Catalog | null;
  workspaces: WorkspacesState;
  /** The last host inspection, refreshed when the panel regains focus. */
  inspection: HostInspection | null;
  composer: {
    prompt: string;
    modelKey: string;
    count: string;
    resolution: string;
    quality: string;
    useForeground: boolean;
    references: ReferenceItem[];
  };
  history: HistoryEntry[];
  job: JobState;
  retained: RetainedResult | null;
  /** A failure of a menu item or pill, shown under the header until the next change. */
  notice: string;
};

export function initialState(version: string, storagePersistent: boolean): AppState {
  return {
    version,
    host: "connecting",
    hostMessage: "",
    mockBackend: false,
    storagePersistent,
    session: "booting",
    sessionError: "",
    initializationError: "",
    account: null,
    catalog: null,
    workspaces: { list: [], selectedId: "", status: "idle", error: "", favicons: {} },
    inspection: null,
    composer: { prompt: "", modelKey: "", count: "1", resolution: "", quality: "", useForeground: false, references: [] },
    history: [],
    job: { status: "idle" },
    retained: null,
    notice: ""
  };
}
