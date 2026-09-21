// Adapted from the Photoshop plugin's AuthScreen (App.tsx, commit ffe30c1b).
import * as React from "react";
import { RefreshCw } from "lucide-react";
import astriaLogo from "../../assets/astria-logo.png";
import { Button } from "../../components/ui/button";
import { useAppState, useController } from "../../app/hooks";
import { cn } from "../../lib/utils";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-[12px] text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/25",
        props.className
      )}
    />
  );
}

export function AuthScreen() {
  const controller = useController();
  const state = useAppState();
  const [key, setKey] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const save = async () => {
    if (!key.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await controller.connect(key);
      setKey("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-composer">
        <img src={astriaLogo} alt="Astria" className="mb-5 size-10" />
        <h1 className="text-lg font-semibold tracking-tight">Connect Astria Photopea</h1>
        <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
          Add your Astria API key to edit the selection, or the whole canvas, in Photopea. New accounts come with free credits.
        </p>
        <div className="mt-5 grid gap-3">
          <Field label="Astria API key">
            <TextInput
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="sd_…"
              autoComplete="off"
              spellCheck={false}
              type="password"
              onKeyDown={(event) => {
                if (event.key === "Enter") void save();
              }}
            />
          </Field>
          {(error || state.sessionError) && <p className="text-[12px] leading-5 text-red-300" role="alert">{error || state.sessionError}</p>}
          {!state.storagePersistent && (
            <p className="text-[11px] leading-4 text-amber-200/90">This browser refuses storage for the plugin, so the key will have to be entered again next time.</p>
          )}
          <Button onClick={() => void save()} disabled={saving || !key.trim()}>
            {saving ? <RefreshCw className="size-4 animate-spin" /> : null}
            {saving ? "Connecting…" : "Connect"}
          </Button>
          <Button variant="ghost" onClick={() => controller.openApiKeyPage()}>
            Get an API key
          </Button>
        </div>
        <p className="mt-5 text-center text-[11px] text-muted-foreground">Astria Photopea {state.version}</p>
      </section>
    </main>
  );
}
