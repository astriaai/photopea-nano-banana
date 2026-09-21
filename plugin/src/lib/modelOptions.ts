// Adapted from nano-banana-photoshop-uxp/nano-banana/ui-src/src/lib/modelOptions.ts
// (commit ffe30c1b) for the normalised catalog. Which pills the option bar
// shows for a model comes from the catalog alone, never from its title.

import type { CatalogModel } from "../domain/catalog";
import type { SelectOption } from "./options";

export const QUALITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max"
};

type Model = CatalogModel | null | undefined;

export function hasResolution(model: Model): boolean {
  return Boolean(model && model.resolutions.length > 0);
}

export function hasQuality(model: Model): boolean {
  return Boolean(model && model.qualities.length > 0);
}

export function resolutionOptions(model: Model): SelectOption[] {
  return (model?.resolutions ?? []).map((value) => ({ value, label: value, icon: "resolution" }));
}

export function qualityOptions(model: Model): SelectOption[] {
  return (model?.qualities ?? []).map((value) => ({ value, label: QUALITY_LABELS[value] ?? value }));
}

export function showsCount(model: Model): boolean {
  return model?.fields.numImages !== false;
}

export function promptRequired(model: Model): boolean {
  return model?.fields.promptOptional !== true;
}

export function showsPrompt(model: Model): boolean {
  return model?.fields.prompt !== false;
}

export const PROMPT_PLACEHOLDER = "Describe the image you want to create…";
export const OPTIONAL_PROMPT_PLACEHOLDER = "Optional: describe the edit, or generate from the selection alone…";

export function promptPlaceholder(model: Model): string {
  return promptRequired(model) ? PROMPT_PLACEHOLDER : OPTIONAL_PROMPT_PLACEHOLDER;
}
