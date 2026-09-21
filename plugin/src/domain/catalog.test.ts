import { describe, expect, it } from "vitest";
import { CatalogError, normalizeCatalog, resolveModelKey, resolveOption, timingFor } from "./catalog";

const reply = {
  models: {
    "tune-1": { id: 1, title: "Nano Banana 2", group: "Popular", icon: "provider-google", resolutions: ["1K", "2K"], default_resolution: "2K", qualities: null, aspect_ratios: ["1:1", "16:9"], fields: { num_images: true, prompt: true, prompt_optional: false, input_image_required: false }, avg_time: 30, timeout: 200, timing: { "1K": { avg_time: 20, timeout: 100 }, "2K": { avg_time: 40, timeout: 300 } } },
    "tune-2": { id: 2, title: "GPT Image", group: "Public", qualities: ["low", "high"], default_quality: "high", support_mask: true, payload: { text: "--disable_mask_crop_resize" }, fields: { num_images: true, prompt: true } },
    "direct-gemini": { id: 3, title: "Direct Gemini", url: "gemini-2.5-flash-image", group: "Direct Gemini" },
    "remove-background": { id: 4, title: "Remove background", group: "Tools", payload: { text: "--remove_background", denoising_strength: 0, num_images: 1 }, aspect_ratios: null, fields: { prompt: false, prompt_optional: true, num_images: false } },
    broken: { title: "" }
  },
  default_model: "tune-1",
  num_images: [1, 2, 3, 4, 8]
};

describe("normalizeCatalog", () => {
  it("keeps Astria-billed models, drops direct rows and malformed entries", () => {
    const catalog = normalizeCatalog(reply);
    expect(catalog.models.map((model) => model.key)).toEqual(["tune-1", "tune-2", "remove-background"]);
    expect(catalog.defaultModelKey).toBe("tune-1");
    expect(catalog.counts).toEqual(["1", "2", "3", "4", "8"]);
  });

  it("normalises options, flags and timing", () => {
    const [nano, gpt, tool] = normalizeCatalog(reply).models;
    expect(nano.resolutions).toEqual(["1K", "2K"]);
    expect(nano.defaultResolution).toBe("2K");
    expect(nano.qualities).toEqual([]);
    expect(timingFor(nano, "1K")).toEqual({ avgTime: 20, timeout: 100 });
    expect(timingFor(nano, "")).toEqual({ avgTime: 30, timeout: 200 });
    expect(gpt.supportMask).toBe(true);
    expect(gpt.defaultQuality).toBe("high");
    expect(gpt.payload).toEqual({ text: "--disable_mask_crop_resize" });
    expect(tool.fields).toEqual({ numImages: false, prompt: false, promptOptional: true, inputImageRequired: false });
    expect(tool.aspectRatios).toEqual([]);
  });

  it("falls back to the first model when the default is unknown", () => {
    const catalog = normalizeCatalog({ ...reply, default_model: "gone" });
    expect(catalog.defaultModelKey).toBe("tune-1");
    expect(resolveModelKey(catalog, "tune-2")).toBe("tune-2");
    expect(resolveModelKey(catalog, "old title")).toBe("tune-1");
  });

  it("rejects an empty or malformed catalog", () => {
    expect(() => normalizeCatalog({})).toThrow(CatalogError);
    expect(() => normalizeCatalog({ models: { only: { id: 9, title: "Direct", url: "x" } } })).toThrow(CatalogError);
  });

  it("resolves saved options against the model's list", () => {
    expect(resolveOption(["1K", "2K"], "2K", "1K")).toBe("2K");
    expect(resolveOption(["1K", "2K"], "4K", "1K")).toBe("1K");
    expect(resolveOption([], "1K", "")).toBe("");
  });
});
