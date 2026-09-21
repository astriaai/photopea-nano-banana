import type { CatalogModel } from "./catalog";

// Text the prompt is followed by so an edit model keeps the surroundings of the
// selection intact. Same wording as the Photoshop plugin (main.js).
export const PRESERVATION_SUFFIX =
  "Edit only what the instruction describes. Keep the exact framing, crop boundaries, dimensions, camera viewpoint, colors, white balance, exposure and lighting of the image unchanged.";

export type RequestOptions = {
  model: CatalogModel;
  /** The user's text, already trimmed. */
  prompt: string;
  /** `#rrggbb` when the foreground colour toggle is on; null otherwise. */
  foregroundHex: string | null;
  /** The split Generate button's "prompt only" send leaves the preservation text out. */
  preserve: boolean;
  count: number;
  resolution: string;
  quality: string;
  /** Whether a composite is sent (whole-canvas or selection edit). */
  hasInputImage: boolean;
  /** `W:H` the capture rectangle was fitted to, or null. */
  aspectRatio: string | null;
};

export type PromptFields = Record<string, string>;

export type PromptRequest = {
  /** Fields posted as prompt[<key>] beside the binary parts. */
  fields: PromptFields;
  /** The text the request carries (with instructions the layer name should not). */
  text: string;
  /** The text used for the placed layer's name and the history entry. */
  displayText: string;
  /** Whether the model takes the exact selection (no context, no ratio, no mask, no references). */
  exactSelection: boolean;
};

/**
 * Whether the host adds the preservation paragraph: an edit prompt over an
 * input image, unless the model takes the exact selection (a tool or an
 * input-only model) or the user asked for the prompt alone.
 */
export function preservationApplies(model: Pick<CatalogModel, "fields" | "group">): boolean {
  return model.fields.prompt && !model.fields.inputImageRequired && model.group !== "Tools";
}

export function isExactSelectionModel(model: Pick<CatalogModel, "fields" | "group">): boolean {
  return model.fields.inputImageRequired || model.group === "Tools";
}

export function acceptsReferences(model: Pick<CatalogModel, "fields" | "group">): boolean {
  return !isExactSelectionModel(model);
}

/**
 * Builds the prompt fields in the Photoshop plugin's order: prompt, foreground
 * colour, then (as its own paragraph) the preservation instruction, then the
 * request-only `--gpt_quality` flag, then the catalog entry's own text.
 * Catalog payload fields win over everything else, except `text`, which is
 * appended rather than replacing.
 */
export function buildPromptRequest(options: RequestOptions): PromptRequest {
  const { model } = options;
  const exactSelection = isExactSelectionModel(model);
  const userText = model.fields.prompt ? options.prompt.trim() : "";
  const withColor = userText && options.foregroundHex ? `${userText} ${options.foregroundHex}` : userText;
  const displayText = withColor;
  const withPreservation = options.preserve && !exactSelection && Boolean(withColor) && options.hasInputImage && preservationApplies(model);
  const paragraphs = [withColor, withPreservation ? PRESERVATION_SUFFIX : ""].filter(Boolean);
  const requestParts = [paragraphs.join("\n\n"), options.quality ? `--gpt_quality ${options.quality}` : ""].filter(Boolean);
  const { text: modelText, ...restPayload } = model.payload;
  const text = [requestParts.join(" "), typeof modelText === "string" ? modelText : ""].filter(Boolean).join(" ");

  const fields: PromptFields = { text };
  const count = model.fields.numImages ? Math.max(1, Math.floor(options.count) || 1) : 1;
  fields.num_images = String(count);
  if (options.resolution && model.resolutions.includes(options.resolution)) fields.resolution = options.resolution;
  if (options.aspectRatio && !exactSelection) fields.aspect_ratio = options.aspectRatio;
  for (const [key, value] of Object.entries(restPayload)) fields[key] = String(value);
  return { fields, text, displayText, exactSelection };
}

/** Whether Generate can run: text is required unless the catalog says the prompt is optional or unused. */
export function canSubmit(model: CatalogModel | null, prompt: string): boolean {
  if (!model) return false;
  if (!model.fields.prompt || model.fields.promptOptional) return true;
  return prompt.trim().length > 0;
}
