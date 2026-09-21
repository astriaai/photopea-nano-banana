// Ported from nano-banana-photoshop-uxp/nano-banana/ui-src/src/lib/utils.ts (commit ffe30c1b).
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
