// The panel shell: header (logo, History, workspace, account), the composer,
// and a footer with the payer's balance and the shortcut hint. Adapted from
// the Photoshop plugin's MainScreen / App (App.tsx, commit ffe30c1b).
import * as React from "react";
import { RefreshCw, X } from "lucide-react";
import astriaLogo from "../assets/astria-logo.png";
import { Button } from "../components/ui/button";
import { TooltipProvider } from "../components/ui/tooltip";
import { AccountMenu } from "../features/account/AccountMenu";
import { AuthScreen } from "../features/account/AuthScreen";
import { WorkspaceSwitcher } from "../features/account/WorkspaceSwitcher";
import { PromptComposer } from "../features/composer/PromptComposer";
import { HistorySelect } from "../features/history/HistorySelect";
import { showsPrompt } from "../lib/modelOptions";
import { useAppState, useController } from "./hooks";

function ActionNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="mx-3 mb-1 flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-500/8 px-3 py-1.5" role="alert">
      <p className="min-w-0 flex-1 text-[11px] leading-4 text-red-200">{message}</p>
      <button type="button" className="shrink-0 text-red-200/70 hover:text-red-200" onClick={onDismiss} aria-label="Dismiss">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function MockBanner() {
  const { mockBackend } = useAppState();
  if (!mockBackend) return null;
  return (
    <div className="mx-3 mb-1 rounded-lg bg-primary/10 px-3 py-1.5 text-[11px] leading-4 text-primary" role="status">
      Mock backend: results are drawn locally, nothing is sent to astria.ai or billed.
    </div>
  );
}

function HostBanner() {
  const { host, hostMessage } = useAppState();
  if (host === "ready") return null;
  const text = host === "fixture"
    ? "Fixture mode: nothing is read from or placed into Photopea."
    : host === "not-embedded"
      ? "Open this plugin from Photopea's Plugins panel to edit documents."
      : host === "unavailable"
        ? hostMessage || "Photopea is not responding. Reload the plugin."
        : "Connecting to Photopea…";
  return (
    <div className={host === "fixture" ? "mx-3 mb-1 rounded-lg bg-primary/10 px-3 py-1.5 text-[11px] leading-4 text-primary" : "mx-3 mb-1 rounded-lg bg-amber-500/10 px-3 py-1.5 text-[11px] leading-4 text-amber-200"} role="status">
      {text}
      {host === "unavailable" && (
        <button type="button" className="ml-2 underline hover:text-foreground" onClick={() => window.location.reload()}>Reload</button>
      )}
    </div>
  );
}

function MainScreen() {
  const controller = useController();
  const state = useAppState();
  const promptVisible = showsPrompt(controller.selectedModel());
  const balance = controller.balanceLabel();
  const payer = state.account?.payer;
  return (
    <main className="flex h-full min-h-full flex-col overflow-y-auto">
      <header className="flex h-11 shrink-0 items-center gap-1 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <img src={astriaLogo} alt="Astria" className="size-7 shrink-0" />
          <div className="hidden min-w-0 min-[320px]:block">
            <h1 className="truncate text-[13px] font-semibold" title={`Astria Photopea ${state.version}`}>Astria Photopea</h1>
            <p className="truncate text-[10px] text-muted-foreground">{state.version}</p>
          </div>
        </div>
        {promptVisible && <HistorySelect />}
        {state.workspaces.list.length > 0 && <WorkspaceSwitcher />}
        <AccountMenu />
      </header>
      <HostBanner />
      <MockBanner />
      {state.notice && <ActionNotice message={state.notice} onDismiss={() => controller.dismissNotice()} />}
      <section className="flex min-h-0 flex-1 shrink-0 px-2 pb-1">
        <PromptComposer />
      </section>
      <footer className="flex min-h-6 shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1 text-[10px] text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          {state.account?.email && <span className="min-w-0 truncate">{state.account.email}</span>}
          {balance && (
            <button
              type="button"
              className="shrink-0 rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              title={payer?.self ? "Add to balance" : `Billed to ${payer?.name || "the workspace owner"}. Opens Add to balance for your account.`}
              onClick={() => controller.openAddBalance()}
            >
              · Balance {balance}{payer && !payer.self && " (workspace)"}
            </button>
          )}
        </span>
        <span className="ml-auto shrink-0">⌘/Ctrl ↵ Generate</span>
      </footer>
    </main>
  );
}

export default function App() {
  const controller = useController();
  const state = useAppState();

  React.useEffect(() => {
    document.getElementById("boot-status")?.remove();
  }, []);

  React.useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void controller.refreshInspection();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [controller]);

  let content: React.ReactNode;
  if (state.session === "booting" || state.session === "connecting") {
    content = (
      <main className="flex h-full items-center justify-center gap-2 text-[12px] text-muted-foreground">
        <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
        <span>{state.session === "connecting" ? "Connecting to astria.ai…" : "Loading…"}</span>
      </main>
    );
  } else if (state.session === "signed-out") {
    content = <AuthScreen />;
  } else if (state.session === "error") {
    content = (
      <main className="flex h-full items-center justify-center p-4 text-center">
        <div className="max-w-xs">
          <p className="text-[13px] font-medium">Something went wrong</p>
          <p className="mt-2 text-[12px] leading-5 text-muted-foreground">{state.sessionError}</p>
          <Button className="mt-4" variant="secondary" onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </main>
    );
  } else {
    content = <MainScreen />;
  }

  return <TooltipProvider delayDuration={450}>{content}</TooltipProvider>;
}
