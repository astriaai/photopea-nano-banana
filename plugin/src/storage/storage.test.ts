import { describe, expect, it } from "vitest";
import { LEGACY_API_KEY, PluginStorage, STORAGE_KEY, type KeyValueStore } from "./storage";

function memory(initial: Record<string, string> = {}): KeyValueStore & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key)
  };
}

describe("PluginStorage", () => {
  it("migrates the legacy API key into the versioned store", () => {
    const store = memory({ [LEGACY_API_KEY]: "sd_legacy" });
    const storage = new PluginStorage(store);
    expect(storage.get().apiKey).toBe("sd_legacy");
    expect(JSON.parse(store.map.get(STORAGE_KEY)!).apiKey).toBe("sd_legacy");
  });

  it("prefers the versioned store over the legacy key and sanitises junk", () => {
    const store = memory({
      [LEGACY_API_KEY]: "sd_legacy",
      [STORAGE_KEY]: JSON.stringify({ version: 1, apiKey: "sd_new", count: "x", optionsByModel: { "tune-1": { resolution: "2K", quality: 5 } }, history: ["a", { text: "b", starred: true }], useForeground: "yes" })
    });
    const state = new PluginStorage(store).get();
    expect(state.apiKey).toBe("sd_new");
    expect(state.count).toBe("1");
    expect(state.optionsByModel).toEqual({ "tune-1": { resolution: "2K" } });
    expect(state.history).toEqual([{ text: "a", starred: false }, { text: "b", starred: true }]);
    expect(state.useForeground).toBe(false);
  });

  it("survives a corrupt store", () => {
    const storage = new PluginStorage(memory({ [STORAGE_KEY]: "{not json" }));
    expect(storage.get().apiKey).toBe("");
  });

  it("forgets both keys on sign-out but keeps the history", () => {
    const store = memory({ [LEGACY_API_KEY]: "sd_legacy" });
    const storage = new PluginStorage(store);
    storage.update({ history: [{ text: "keep", starred: false }], workspaceId: "7" });
    storage.signOut();
    expect(storage.get().apiKey).toBe("");
    expect(storage.get().workspaceId).toBe("");
    expect(storage.get().history).toEqual([{ text: "keep", starred: false }]);
    expect(store.map.has(LEGACY_API_KEY)).toBe(false);
  });

  it("falls back to memory when the browser refuses storage", () => {
    const storage = new PluginStorage(null);
    expect(storage.persistent).toBe(false);
    storage.update({ apiKey: "sd_x" });
    expect(storage.get().apiKey).toBe("sd_x");
  });
});
