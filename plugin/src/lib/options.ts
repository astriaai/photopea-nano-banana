// Ported from nano-banana-photoshop-uxp/nano-banana/ui-src/src/lib/options.ts (commit ffe30c1b).
export type SelectOption = {
  value: string;
  label: string;
  /** Shorter text for the closed toggle; defaults to label. */
  toggleLabel?: string | null;
  /** Key into ICONS; unknown keys render nothing (like astria's private tunes). */
  icon?: string | null;
  /** Image for the icon slot (a workspace favicon as a data URI); `icon` takes over when it fails to load. */
  iconUrl?: string | null;
  /** Muted suffix after the label ("image" / "images"). */
  detail?: string | null;
  /** Optional section title; consecutive options with the same group share one heading. */
  group?: string | null;
};

/** Case-insensitive substring match over label, detail and value. Empty query returns everything. */
export function filterOptions(options: SelectOption[], query: string): SelectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((option) => [option.label, option.detail, option.value].some((field) => field?.toLowerCase().includes(q)));
}
