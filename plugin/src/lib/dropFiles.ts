// Adapted from nano-banana-photoshop-uxp/nano-banana/ui-src/src/lib/dropFiles.ts
// (commit ffe30c1b). In Photopea the panel is an ordinary browser frame, so
// dropped files stay File objects; only the drag detection is shared.

/** Whether a drag carries OS files (as opposed to text dragged within the panel). */
export function isFileDrag(types: ArrayLike<string> | null | undefined): boolean {
  return Array.from(types ?? []).includes("Files");
}
