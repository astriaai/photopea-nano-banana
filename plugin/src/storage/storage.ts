// Versioned persistence in the iframe's localStorage. The plugin is a
// third-party frame inside photopea.com, so the browser may partition, clear
// or refuse this storage; every access is guarded and a refusal degrades to
// an in-memory session the UI can warn about. This is ordinary web storage,
// not a secure store: the key is readable by anything on this origin.

import { normalizeHistory, type HistoryEntry } from "../domain/history";

export const STORAGE_KEY = "astria.photopea.v1";
/** The key the legacy plugin (index.html at the repository root) saved the API key under. */
export const LEGACY_API_KEY = "astriaApiKey";

export type ModelOptions = { resolution?: string; quality?: string };

export type PersistedState = {
  version: 1;
  apiKey: string;
  modelKey: string;
  count: string;
  optionsByModel: Record<string, ModelOptions>;
  workspaceId: string;
  useForeground: boolean;
  history: HistoryEntry[];
};

export const EMPTY_STATE: PersistedState = {
  version: 1,
  apiKey: "",
  modelKey: "",
  count: "1",
  optionsByModel: {},
  workspaceId: "",
  useForeground: false,
  history: []
};

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function browserStore(): KeyValueStore | null {
  try {
    const store = window.localStorage;
    const probe = `${STORAGE_KEY}.probe`;
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

function sanitize(value: unknown, fallback: PersistedState): PersistedState {
  const json = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const optionsByModel: Record<string, ModelOptions> = {};
  const rawOptions = json.optionsByModel && typeof json.optionsByModel === "object" ? (json.optionsByModel as Record<string, unknown>) : {};
  for (const [key, options] of Object.entries(rawOptions)) {
    const entry = options && typeof options === "object" ? (options as Record<string, unknown>) : {};
    optionsByModel[key] = {
      ...(typeof entry.resolution === "string" ? { resolution: entry.resolution } : {}),
      ...(typeof entry.quality === "string" ? { quality: entry.quality } : {})
    };
  }
  return {
    version: 1,
    apiKey: typeof json.apiKey === "string" ? json.apiKey : fallback.apiKey,
    modelKey: typeof json.modelKey === "string" ? json.modelKey : fallback.modelKey,
    count: typeof json.count === "string" && /^\d+$/.test(json.count) ? json.count : fallback.count,
    optionsByModel,
    workspaceId: typeof json.workspaceId === "string" ? json.workspaceId : fallback.workspaceId,
    useForeground: json.useForeground === true,
    history: normalizeHistory(json.history)
  };
}

export class PluginStorage {
  private store: KeyValueStore;
  /** False when the browser refused localStorage: nothing survives a reload. */
  readonly persistent: boolean;
  private state: PersistedState;

  constructor(store?: KeyValueStore | null) {
    const chosen = store === undefined ? browserStore() : store;
    this.persistent = chosen !== null;
    this.store = chosen ?? new MemoryStore();
    this.state = this.load();
  }

  private load(): PersistedState {
    let state = { ...EMPTY_STATE };
    try {
      const raw = this.store.getItem(STORAGE_KEY);
      if (raw) state = sanitize(JSON.parse(raw), EMPTY_STATE);
    } catch {
      state = { ...EMPTY_STATE };
    }
    // Migration 0 -> 1: the legacy plugin kept only the API key, under its own name.
    if (!state.apiKey) {
      try {
        const legacy = this.store.getItem(LEGACY_API_KEY);
        if (legacy && legacy.trim()) {
          state = { ...state, apiKey: legacy.trim() };
          this.write(state);
        }
      } catch {
        // Nothing to migrate.
      }
    }
    return state;
  }

  private write(state: PersistedState): void {
    try {
      this.store.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota or a refusal: the in-memory copy still serves this session.
    }
  }

  get(): PersistedState {
    return this.state;
  }

  update(patch: Partial<Omit<PersistedState, "version">>): PersistedState {
    this.state = { ...this.state, ...patch, version: 1 };
    this.write(this.state);
    return this.state;
  }

  /** Forgets the credentials and everything tied to the account; keeps the prompt history. */
  signOut(): PersistedState {
    this.state = { ...this.state, apiKey: "", workspaceId: "" };
    this.write(this.state);
    try {
      this.store.removeItem(LEGACY_API_KEY);
    } catch {
      // ignore
    }
    return this.state;
  }
}
