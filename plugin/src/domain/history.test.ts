import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, clearUnstarred, normalizeHistory, removePrompt, reusePrompt, setStarred } from "./history";

describe("history", () => {
  it("normalises strings and objects, dropping blanks and duplicates", () => {
    expect(normalizeHistory(["a", { text: "b", starred: true }, "", { text: "a" }, 3])).toEqual([{ text: "a", starred: false }, { text: "b", starred: true }]);
    expect(normalizeHistory("nope")).toEqual([]);
  });

  it("keeps the most recent unstarred entries and every starred one", () => {
    let entries = normalizeHistory([]);
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) entries = reusePrompt(entries, `prompt ${i}`);
    entries = setStarred(entries, `prompt ${HISTORY_LIMIT + 4}`, true);
    for (let i = 0; i < 5; i++) entries = reusePrompt(entries, `later ${i}`);
    expect(entries.filter((entry) => !entry.starred)).toHaveLength(HISTORY_LIMIT);
    expect(entries.some((entry) => entry.text === `prompt ${HISTORY_LIMIT + 4}`)).toBe(true);
  });

  it("promotes a reused prompt without duplicating it", () => {
    const entries = reusePrompt(reusePrompt(reusePrompt([], "one"), "two"), "one");
    expect(entries.map((entry) => entry.text)).toEqual(["one", "two"]);
  });

  it("removes and clears", () => {
    const entries = setStarred(reusePrompt(reusePrompt([], "keep"), "drop"), "keep", true);
    expect(removePrompt(entries, "drop").map((entry) => entry.text)).toEqual(["keep"]);
    expect(clearUnstarred(entries)).toEqual([{ text: "keep", starred: true }]);
  });
});
