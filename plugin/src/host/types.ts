import type { Bounds } from "../domain/geometry";

/** What identifies the document a job captured, checked again before anything is placed. */
export type DocumentIdentity = {
  name: string;
  source: string;
  width: number;
  height: number;
  /** Position in app.documents when captured; a hint, not an identity. */
  index: number;
};

export type DocumentInfo = DocumentIdentity & {
  layerCount: number;
  layerIds: number[];
  activeLayerId: number;
  activeLayerName: string;
  /** Current selection bounds, or null when nothing is selected. */
  selection: Bounds | null;
};

export type HostInspection = {
  hasDocument: boolean;
  documentCount: number;
  document: DocumentInfo | null;
  /** Foreground colour as `#rrggbb`, or null when unavailable. */
  foregroundHex: string | null;
};

export type PlacedLayerCheck = {
  newIds: number[];
  activeId: number;
  activeIsNew: boolean;
  isSmartObject: boolean;
  bounds: Bounds | null;
  hasSelection: boolean;
};

export type TransformResult = {
  before: Bounds | null;
  resized: Bounds | null;
  placed: Bounds | null;
};

export type HostErrorCode =
  | "not-embedded"
  | "timeout"
  | "unavailable"
  | "script"
  | "no-document"
  | "no-selection"
  | "document-missing"
  | "document-ambiguous"
  | "layer-missing"
  | "placement";

export class HostError extends Error {
  code: HostErrorCode;
  constructor(code: HostErrorCode, message: string) {
    super(message);
    this.name = "HostError";
    this.code = code;
  }
}

/**
 * The operations the generation flow needs from the host. `PhotopeaHost` runs
 * them as scripts in Photopea; `FixtureHost` fakes them for UI development.
 */
export interface Host {
  readonly kind: "photopea" | "fixture";
  /** Proves the host answers; rejects with HostError("unavailable") otherwise. */
  ping(): Promise<void>;
  inspect(): Promise<HostInspection>;
  /** The flattened document as PNG bytes. */
  exportComposite(): Promise<ArrayBuffer>;
  /** The current selection as a black/white PNG the size of the document. */
  exportSelectionMask(): Promise<ArrayBuffer>;
  /** The active layer alone (with its ancestors visible) as PNG bytes, plus its name. */
  exportActiveLayer(): Promise<{ bytes: ArrayBuffer; name: string }>;
  /** Re-activates the captured document; null when it is gone. Throws on ambiguity. */
  selectDocument(identity: DocumentIdentity): Promise<DocumentInfo | null>;
  /** Saves the selection into a temporary layer mask so it can be reloaded later; null when nothing is selected. */
  storeSelection(layerName: string): Promise<{ tempLayerId: number } | null>;
  deselect(): Promise<void>;
  /** Opens a PNG data URL as a smart object; returns the top-level layer ids that existed before. */
  placeImage(dataUrl: string): Promise<{ before: number[] }>;
  verifyPlaced(before: number[]): Promise<PlacedLayerCheck>;
  /** Scales the layer uniformly, centres it on `target` and renames it. Deselects first: bounds are only reliable without a selection. */
  transformLayer(layerId: number, percent: number, target: Bounds, name: string): Promise<TransformResult>;
  /** Reloads the stored selection, expands and feathers it, and adds it as a reveal mask on `layerId`. Leaves nothing selected. */
  applyRevealMask(tempLayerId: number, layerId: number, radius: number): Promise<void>;
  /** Reloads the stored selection, removes the temporary layer and re-activates `activateLayerId`. */
  restoreSelection(tempLayerId: number, activateLayerId: number | null): Promise<void>;
  /** Removes top-level layers whose names start with `prefix` (crash recovery). */
  removeLayersByPrefix(prefix: string): Promise<number>;
}
