// Adapted from the Photoshop plugin's useFileDrop (App.tsx, commit ffe30c1b).
// OS files dropped anywhere on the panel become reference images. Every file
// drag is claimed so the browser never navigates to the file or pastes its
// path into the textarea; `dropEffect` tells the OS whether it is accepted.
import * as React from "react";
import { isFileDrag } from "../../lib/dropFiles";

export function useFileDrop({ enabled, onDrop }: { enabled: boolean; onDrop: (files: File[]) => void }): boolean {
  const [active, setActive] = React.useState(false);
  const handler = React.useRef(onDrop);
  handler.current = onDrop;

  React.useEffect(() => {
    let depth = 0;
    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event.dataTransfer?.types)) return;
      event.preventDefault();
      depth += 1;
      setActive(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!isFileDrag(event.dataTransfer?.types)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = enabled ? "copy" : "none";
    };
    const onDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event.dataTransfer?.types)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setActive(false);
    };
    const onDropEvent = (event: DragEvent) => {
      if (!isFileDrag(event.dataTransfer?.types)) return;
      event.preventDefault();
      depth = 0;
      setActive(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (enabled && files.length) handler.current(files);
    };
    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDropEvent);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDropEvent);
    };
  }, [enabled]);

  return active;
}
