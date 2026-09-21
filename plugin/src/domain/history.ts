// Prompt history: array order is recency; stars protect saved prompts without
// pinning them above a more recent reuse. Ported from the Photoshop plugin's
// promptHistory.js.

export type HistoryEntry = { text: string; starred: boolean };

export const HISTORY_LIMIT = 20;

function trim(entries: HistoryEntry[]): HistoryEntry[] {
  let recent = 0;
  return entries.filter((entry) => entry.starred || ++recent <= HISTORY_LIMIT);
}

/** Accepts the stored array (objects, or plain strings from older builds); drops blanks and duplicates. */
export function normalizeHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: HistoryEntry[] = [];
  for (const item of value) {
    const text = typeof item === "string" ? item : item && typeof item === "object" ? (item as { text?: unknown }).text : undefined;
    if (typeof text !== "string" || !text.trim()) continue;
    const starred = typeof item === "object" && item !== null && (item as { starred?: unknown }).starred === true;
    const existing = entries.find((entry) => entry.text === text);
    if (existing) existing.starred = existing.starred || starred;
    else entries.push({ text, starred });
  }
  return trim(entries);
}

export function reusePrompt(entries: HistoryEntry[], text: string): HistoryEntry[] {
  if (!text.trim()) return entries;
  const existing = entries.find((entry) => entry.text === text);
  return trim([existing || { text, starred: false }, ...entries.filter((entry) => entry.text !== text)]);
}

export function setStarred(entries: HistoryEntry[], text: string, starred: boolean): HistoryEntry[] {
  return trim(entries.map((entry) => (entry.text === text ? { ...entry, starred } : entry)));
}

export function removePrompt(entries: HistoryEntry[], text: string): HistoryEntry[] {
  return entries.filter((entry) => entry.text !== text);
}

export function clearUnstarred(entries: HistoryEntry[]): HistoryEntry[] {
  return entries.filter((entry) => entry.starred);
}
