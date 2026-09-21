import * as React from "react";
import type { AppController } from "./controller";
import type { AppState } from "./state";

const ControllerContext = React.createContext<AppController | null>(null);

export const ControllerProvider = ControllerContext.Provider;

export function useController(): AppController {
  const controller = React.useContext(ControllerContext);
  if (!controller) throw new Error("useController must be used inside ControllerProvider.");
  return controller;
}

export function useAppState(): AppState {
  const controller = useController();
  return React.useSyncExternalStore(controller.store.subscribe, controller.store.get, controller.store.get);
}

/**
 * Runs a controller action whose caller has nothing to await; a failure is
 * shown as the panel's notice instead of vanishing into an unhandled rejection.
 */
export function useAction(): (label: string, action: () => void | Promise<void>) => void {
  const controller = useController();
  return React.useCallback((label, action) => {
    Promise.resolve()
      .then(action)
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        controller.store.set({ notice: `${label} failed: ${reason}` });
      });
  }, [controller]);
}
