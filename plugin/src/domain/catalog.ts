// The /plugin/models catalog, normalised. Everything the composer shows and
// every request field it sends comes from these entries; titles are display
// only and never decide behaviour.

export type CatalogFields = {
  numImages: boolean;
  prompt: boolean;
  promptOptional: boolean;
  inputImageRequired: boolean;
};

export type ModelTiming = { avgTime: number; timeout: number };

export type CatalogModel = {
  /** Stable key (`tune-123`, `remove-background`); persisted as the selection. */
  key: string;
  /** Astria tune id the prompt is created under. */
  id: number;
  title: string;
  group: string;
  icon: string | null;
  /** Direct provider rows (`url`), generated client-side with the user's own key: not offered by this plugin yet. */
  direct: boolean;
  /** Fields merged over the request; its `text` is appended to the prompt text instead. */
  payload: Record<string, string | number | boolean>;
  supportMask: boolean;
  resolutions: string[];
  defaultResolution: string;
  qualities: string[];
  defaultQuality: string;
  /** `W:H` keys the model accepts; empty means the capture keeps its own proportions and sends no ratio. */
  aspectRatios: string[];
  fields: CatalogFields;
  timing: ModelTiming;
  timingByResolution: Record<string, ModelTiming>;
};

export type Catalog = {
  models: CatalogModel[];
  defaultModelKey: string;
  /** Allowed image counts, as strings for the option pill. */
  counts: string[];
};

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogError";
  }
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string | number => typeof item === "string" || typeof item === "number").map(String) : [];
}

function asTiming(value: unknown, fallback: ModelTiming): ModelTiming {
  const json = asObject(value);
  const avgTime = Number(json?.avg_time);
  const timeout = Number(json?.timeout);
  return {
    avgTime: Number.isFinite(avgTime) && avgTime > 0 ? avgTime : fallback.avgTime,
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : fallback.timeout
  };
}

export const DEFAULT_TIMING: ModelTiming = { avgTime: 0, timeout: 180 };

function normalizeFields(value: unknown): CatalogFields {
  const json = asObject(value) || {};
  return {
    numImages: json.num_images !== false,
    prompt: json.prompt !== false,
    promptOptional: json.prompt_optional === true,
    inputImageRequired: json.input_image_required === true
  };
}

function normalizePayload(value: unknown): Record<string, string | number | boolean> {
  const json = asObject(value) || {};
  const payload: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(json)) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") payload[key] = item;
  }
  return payload;
}

export function normalizeModel(key: string, value: unknown): CatalogModel | null {
  const json = asObject(value);
  if (!json) return null;
  const id = Number(json.id);
  const title = typeof json.title === "string" ? json.title.trim() : "";
  if (!key || !title) return null;
  const direct = typeof json.url === "string" && json.url.length > 0;
  if (!direct && !Number.isFinite(id)) return null;
  const resolutions = asStringList(json.resolutions);
  const qualities = asStringList(json.qualities);
  const timing = asTiming(json, DEFAULT_TIMING);
  const timingByResolution: Record<string, ModelTiming> = {};
  const timingJson = asObject(json.timing);
  if (timingJson) {
    for (const resolution of resolutions) {
      if (resolution in timingJson) timingByResolution[resolution] = asTiming(timingJson[resolution], timing);
    }
  }
  const defaultResolution = typeof json.default_resolution === "string" && resolutions.includes(json.default_resolution)
    ? json.default_resolution
    : resolutions[0] || "";
  const defaultQuality = typeof json.default_quality === "string" && qualities.includes(json.default_quality)
    ? json.default_quality
    : qualities[0] || "";
  return {
    key,
    id: Number.isFinite(id) ? id : 0,
    title,
    group: typeof json.group === "string" ? json.group : "",
    icon: typeof json.icon === "string" ? json.icon : null,
    direct,
    payload: normalizePayload(json.payload),
    supportMask: json.support_mask === true,
    resolutions,
    defaultResolution,
    qualities,
    defaultQuality,
    aspectRatios: asStringList(json.aspect_ratios),
    fields: normalizeFields(json.fields),
    timing,
    timingByResolution
  };
}

/**
 * Normalises a `/plugin/models` reply. Direct provider rows are dropped until
 * the plugin has a provider adapter for them; an empty or malformed catalog is
 * an error the UI shows with a retry, never a blank picker.
 */
export function normalizeCatalog(value: unknown): Catalog {
  const json = asObject(value);
  const modelsJson = asObject(json?.models);
  if (!json || !modelsJson) throw new CatalogError("The model catalog reply was not understood.");
  const models: CatalogModel[] = [];
  for (const [key, entry] of Object.entries(modelsJson)) {
    const model = normalizeModel(key, entry);
    if (model && !model.direct) models.push(model);
  }
  if (models.length === 0) throw new CatalogError("The model catalog has no models this plugin can use.");
  const requestedDefault = typeof json.default_model === "string" ? json.default_model : "";
  const defaultModelKey = models.some((model) => model.key === requestedDefault) ? requestedDefault : models[0].key;
  const counts = asStringList(json.num_images).filter((count) => /^\d+$/.test(count));
  return { models, defaultModelKey, counts: counts.length ? counts : ["1"] };
}

/** The saved model key when the catalog still lists it, else the catalog default. */
export function resolveModelKey(catalog: Catalog, savedKey: string | null | undefined): string {
  return savedKey && catalog.models.some((model) => model.key === savedKey) ? savedKey : catalog.defaultModelKey;
}

export function findModel(catalog: Catalog | null, key: string): CatalogModel | null {
  return catalog?.models.find((model) => model.key === key) || null;
}

export function timingFor(model: CatalogModel, resolution: string): ModelTiming {
  return (resolution && model.timingByResolution[resolution]) || model.timing;
}

/** Which resolution/quality to send: the saved one when the model lists it, else its default. */
export function resolveOption(values: string[], saved: string | undefined, fallback: string): string {
  if (!values.length) return "";
  return saved && values.includes(saved) ? saved : fallback;
}
