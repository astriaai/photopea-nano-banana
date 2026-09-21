import { describe, expect, it } from "vitest";
import { normalizeCatalog } from "./catalog";
import { PRESERVATION_SUFFIX, buildPromptRequest, canSubmit, preservationApplies } from "./request";

const catalog = normalizeCatalog({
  models: {
    "tune-1": { id: 1, title: "Nano Banana 2", group: "Popular", resolutions: ["1K", "2K"], default_resolution: "1K", aspect_ratios: ["1:1"], fields: {} },
    "tune-2": { id: 2, title: "GPT Image", group: "Public", qualities: ["low", "high"], payload: { text: "--disable_mask_crop_resize", seed: -1 } },
    "remove-background": { id: 4, title: "Remove background", group: "Tools", payload: { text: "--remove_background", denoising_strength: 0, num_images: 1 }, fields: { prompt: false, prompt_optional: true, num_images: false } },
    "input-only": { id: 5, title: "Layer separation", group: "Public", fields: { input_image_required: true, prompt_optional: true } }
  },
  default_model: "tune-1"
});
const [nano, gpt, tool, inputOnly] = catalog.models;

const base = { prompt: "a red hat", foregroundHex: null, preserve: true, count: 2, resolution: "", quality: "", hasInputImage: true, aspectRatio: "1:1" as string | null };

describe("buildPromptRequest", () => {
  it("adds the preservation paragraph and the selected options", () => {
    const request = buildPromptRequest({ ...base, model: nano, resolution: "2K" });
    expect(request.fields.text).toBe(`a red hat\n\n${PRESERVATION_SUFFIX}`);
    expect(request.fields.num_images).toBe("2");
    expect(request.fields.resolution).toBe("2K");
    expect(request.fields.aspect_ratio).toBe("1:1");
    expect(request.displayText).toBe("a red hat");
  });

  it("leaves the preservation text out on a prompt-only send and without an input image", () => {
    expect(buildPromptRequest({ ...base, model: nano, preserve: false }).fields.text).toBe("a red hat");
    expect(buildPromptRequest({ ...base, model: nano, hasInputImage: false }).fields.text).toBe("a red hat");
  });

  it("appends the foreground colour, the quality flag and the model text in order", () => {
    const request = buildPromptRequest({ ...base, model: gpt, foregroundHex: "#ff0000", quality: "high" });
    expect(request.fields.text).toBe(`a red hat #ff0000\n\n${PRESERVATION_SUFFIX} --gpt_quality high --disable_mask_crop_resize`);
    expect(request.fields.seed).toBe("-1");
    expect(request.displayText).toBe("a red hat #ff0000");
  });

  it("sends a tool's payload text alone, one image, no ratio", () => {
    const request = buildPromptRequest({ ...base, model: tool, foregroundHex: "#ff0000" });
    expect(request.fields.text).toBe("--remove_background");
    expect(request.fields.num_images).toBe("1");
    expect(request.fields.aspect_ratio).toBeUndefined();
    expect(request.fields.denoising_strength).toBe("0");
    expect(request.exactSelection).toBe(true);
  });

  it("treats an input-only model as exact selection without preservation", () => {
    const request = buildPromptRequest({ ...base, model: inputOnly, prompt: "" });
    expect(request.fields.text).toBe("");
    expect(request.exactSelection).toBe(true);
    expect(preservationApplies(inputOnly)).toBe(false);
  });

  it("gates Generate on the prompt flags", () => {
    expect(canSubmit(nano, "")).toBe(false);
    expect(canSubmit(nano, "hi")).toBe(true);
    expect(canSubmit(tool, "")).toBe(true);
    expect(canSubmit(inputOnly, "")).toBe(true);
    expect(canSubmit(null, "hi")).toBe(false);
  });
});
