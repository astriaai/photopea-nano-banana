// Adapted from the Photoshop plugin's ReferenceTile / ThumbnailStrip (App.tsx, commit ffe30c1b).
import * as React from "react";
import { ImagePlus, Layers3, X } from "lucide-react";
import { useAction, useAppState, useController } from "../../app/hooks";
import type { ReferenceItem } from "../../app/state";
import { ACCEPTED_REFERENCE_TYPES } from "../../app/controller";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { cn } from "../../lib/utils";

function ReferenceTile({ item, busy }: { item: ReferenceItem; busy: boolean }) {
  const controller = useController();
  const fallback = item.kind === "layer" ? <Layers3 className="size-5" /> : <ImagePlus className="size-5" />;
  return (
    <div className="relative size-16 shrink-0">
      <div className="relative size-16 overflow-hidden rounded-xl border border-border bg-muted">
        {item.preview ? <img className="size-full object-cover" src={item.preview} alt={item.name} /> : <span className="flex size-full items-center justify-center text-muted-foreground">{fallback}</span>}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="absolute -left-1.5 -top-1.5 z-10 grid size-5 place-items-center rounded-full bg-neutral-700 text-white outline-none hover:bg-neutral-950 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
            aria-label={`Remove ${item.name}`}
            disabled={busy}
            onClick={() => controller.removeReference(item.id)}
          ><X className="size-3" /></button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">Remove {item.name}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function ThumbnailStrip({ busy, referencesAllowed, showClear, hasPrompt, onClearPrompt }: {
  busy: boolean;
  referencesAllowed: boolean;
  showClear: boolean;
  hasPrompt: boolean;
  onClearPrompt: () => void;
}) {
  const controller = useController();
  const { composer, host } = useAppState();
  const run = useAction();
  const fileInput = React.useRef<HTMLInputElement | null>(null);
  const addButtonClass = "flex size-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-white/[0.025] text-muted-foreground outline-none";
  const layerAvailable = host === "ready" || host === "fixture";
  return (
    <div className="thumbnail-strip flex items-start gap-1.5 pb-1 pl-1.5 pr-3 pt-1.5">
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_REFERENCE_TYPES.join(",")}
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length) run("Adding images", () => controller.addFileReferences(files));
        }}
      />
      <div className="thumbnail-row flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 pl-1.5 pt-1.5">
        {composer.references.map((item) => <ReferenceTile key={item.id} item={item} busy={busy} />)}
        {referencesAllowed ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(addButtonClass, "hover:border-muted-foreground hover:bg-white/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-45")} disabled={busy} aria-label="Add reference image">
                <ImagePlus className="size-5" />
                <span className="add-image-label text-[10px]">Add image</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" collisionPadding={8}>
              <DropdownMenuItem onSelect={() => fileInput.current?.click()}><ImagePlus className="size-4" />Images from disk</DropdownMenuItem>
              <DropdownMenuItem disabled={!layerAvailable} onSelect={() => run("Adding the current layer", () => controller.addLayerReference())}><Layers3 className="size-4" />Current layer</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn(addButtonClass, "opacity-45")} role="img" aria-label="This model does not take reference images">
                <ImagePlus className="size-5" />
                <span className="add-image-label text-[10px]">Add image</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">This model does not take reference images</TooltipContent>
          </Tooltip>
        )}
      </div>
      {showClear && (
        <button
          type="button"
          className="mt-1.5 flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground outline-none hover:bg-white/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
          disabled={busy || !hasPrompt}
          aria-label="Clear prompt"
          onClick={onClearPrompt}
        >
          <X className="size-3" />
          <span>Clear</span>
        </button>
      )}
    </div>
  );
}
