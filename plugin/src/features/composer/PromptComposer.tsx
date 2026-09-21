// Adapted from the Photoshop plugin's PromptComposer and GenerateSplitButton
// (App.tsx, commit ffe30c1b). The composer is the panel's primary surface:
// references, prompt, status, then one row of option pills and Generate.
import * as React from "react";
import { ArrowUp, ChevronDown, ImagePlus, Palette, RefreshCw } from "lucide-react";
import { useAction, useAppState, useController } from "../../app/hooks";
import { Button } from "../../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { SearchableSelect, type SelectOption } from "../../components/ui/searchable-select";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { acceptsReferences, preservationApplies } from "../../domain/request";
import { providerIconForModel } from "../../lib/icons";
import { hasQuality, hasResolution, promptPlaceholder, promptRequired, qualityOptions, resolutionOptions, showsCount, showsPrompt } from "../../lib/modelOptions";
import { cn } from "../../lib/utils";
import { GenerationStatus } from "../generation/GenerationStatus";
import { ThumbnailStrip } from "./ThumbnailStrip";
import { useFileDrop } from "./useFileDrop";

function GenerateSplitButton({ busy, disabled, hasText, onGenerate }: {
  busy: boolean;
  disabled: boolean;
  hasText: boolean;
  onGenerate: (options?: { preserve?: boolean }) => void;
}) {
  const segment = "flex h-8 items-center justify-center bg-transparent text-inherit outline-none transition-colors hover:bg-background/10 focus-visible:ring-2 focus-visible:ring-primary/70 disabled:pointer-events-none";
  return (
    <div className={cn("flex h-8 shrink-0 rounded-full", disabled ? "bg-foreground text-background opacity-45" : "bg-primary text-primary-foreground")}>
      <button type="button" className={cn(segment, "w-8 rounded-l-full")} onClick={() => onGenerate()} disabled={disabled} aria-label="Generate image">
        {busy ? <RefreshCw className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cn(segment, "w-6 rounded-r-full border-l", disabled ? "border-background/20" : "border-primary-foreground/20", "data-[state=open]:bg-background/10")} disabled={disabled} aria-label="More ways to generate">
            <ChevronDown className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" collisionPadding={8} className="w-60 max-w-[calc(100vw-16px)]">
          <DropdownMenuItem className="items-start" disabled={!hasText} onSelect={() => onGenerate({ preserve: false })}>
            <ArrowUp className="mt-0.5 size-4 shrink-0" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span>Generate with the prompt only</span>
              <span className="text-[11px] leading-snug text-muted-foreground">Without the added instruction to keep framing, colors and lighting unchanged.</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function DocumentNote() {
  const { inspection, host } = useAppState();
  if (host !== "ready" || !inspection || inspection.hasDocument) return null;
  return (
    <p className="px-4 pb-2 text-[11px] leading-4 text-amber-200/90" role="note">
      No document is open in Photopea. Open or create one, then generate.
    </p>
  );
}

export function PromptComposer() {
  const controller = useController();
  const state = useAppState();
  const run = useAction();
  const { composer, catalog, job } = state;
  const busy = job.status === "working";
  const model = controller.selectedModel();
  const countVisible = showsCount(model);
  const referencesAllowed = model ? acceptsReferences(model) : true;
  const promptVisible = showsPrompt(model);
  const textRequired = promptVisible && promptRequired(model);
  const splitGenerate = model ? preservationApplies(model) : false;
  const hasText = composer.prompt.trim().length > 0;
  const modelOptions = React.useMemo<SelectOption[]>(
    () => (catalog?.models ?? []).map((entry) => ({ value: entry.key, label: entry.title, icon: providerIconForModel(entry), group: entry.group || null })),
    [catalog]
  );
  const countOptions = React.useMemo<SelectOption[]>(
    () => (catalog?.counts ?? ["1"]).map((count) => ({ value: count, label: count, detail: count === "1" ? "image" : "images", icon: "layers" })),
    [catalog]
  );
  const resolutionChoices = React.useMemo(() => resolutionOptions(model), [model]);
  const qualityChoices = React.useMemo(() => qualityOptions(model), [model]);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const generate = (options: { preserve?: boolean } = {}) => {
    if (busy || (textRequired && !hasText)) return;
    run("Generate", () => controller.generate(options));
  };

  const dropActive = useFileDrop({
    enabled: referencesAllowed && !busy,
    onDrop: (files) => run("Adding images", () => controller.addFileReferences(files))
  });

  return (
    <div className="prompt-studio relative flex min-h-[200px] flex-1 flex-col overflow-hidden rounded-[18px] border border-border bg-card shadow-composer">
      {dropActive && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[18px] border-2 border-dashed border-primary bg-card/90 px-4 text-center text-[13px] font-medium text-foreground">
          <span className="flex items-center gap-2">
            <ImagePlus className="size-4 shrink-0" />
            {!referencesAllowed ? "This model does not take reference images" : busy ? "Wait for the current generation to finish" : "Drop images to add them as references"}
          </span>
        </div>
      )}
      <div className="shrink-0"><ThumbnailStrip busy={busy} referencesAllowed={referencesAllowed} showClear={promptVisible} hasPrompt={hasText} onClearPrompt={() => {
        controller.setPrompt("");
        textareaRef.current?.focus();
      }} /></div>
      <div className="flex min-h-[64px] flex-1 flex-col overflow-y-auto">
        {promptVisible ? (
          <textarea
            ref={textareaRef}
            value={composer.prompt}
            onChange={(event) => controller.setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                generate();
              }
            }}
            className="prompt-input min-h-[64px] w-full flex-1 resize-none bg-transparent px-4 pb-3 pt-2 text-[14px] leading-[1.55] text-foreground outline-none placeholder:text-muted-foreground/65"
            placeholder={promptPlaceholder(model)}
            aria-label="Image prompt"
            disabled={busy}
          />
        ) : (
          <div className="prompt-input flex min-h-[64px] w-full flex-1 flex-col justify-center gap-1 px-4 pb-3 pt-2 text-[13px] leading-[1.55] text-muted-foreground" role="note">
            <p><span className="font-medium text-foreground">{model?.title || "This tool"}</span> works on the selection alone.</p>
            <p>No prompt needed. Select the area in Photopea and generate.</p>
          </div>
        )}
      </div>
      <div className="shrink-0">
        <DocumentNote />
        <GenerationStatus />
      </div>
      <div className="option-bar flex shrink-0 min-w-0 flex-wrap items-center gap-1.5 px-2.5 pb-2.5 pt-1.5">
        <SearchableSelect
          options={modelOptions}
          value={composer.modelKey || null}
          onChange={(value) => controller.setModel(value)}
          placeholder="Model"
          searchPlaceholder="Search models"
          toggleIcon="sparkles"
          width={280}
          disabled={busy || modelOptions.length === 0}
        />
        {countVisible && (
          <SearchableSelect
            options={countOptions}
            value={composer.count || "1"}
            onChange={(value) => controller.setCount(value)}
            header="Choose number of images"
            ariaLabel="Number of images"
            toggleIcon="layers"
            width={220}
            disabled={busy}
          />
        )}
        {hasResolution(model) && (
          <SearchableSelect
            options={resolutionChoices}
            value={composer.resolution}
            onChange={(value) => controller.setResolution(value)}
            placeholder="Resolution"
            header="Choose image resolution"
            ariaLabel="Resolution"
            toggleIcon="resolution"
            searchable={false}
            width={180}
            disabled={busy}
          />
        )}
        {hasQuality(model) && (
          <SearchableSelect
            options={qualityChoices}
            value={composer.quality}
            onChange={(value) => controller.setQuality(value)}
            placeholder="Quality"
            header="Choose image quality"
            ariaLabel="Quality"
            searchable={false}
            width={180}
            disabled={busy}
          />
        )}
        {promptVisible && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={composer.useForeground ? "secondary" : "ghost"}
                size="icon"
                className="size-7 shrink-0 rounded-full bg-white/10 hover:bg-white/15"
                disabled={busy}
                aria-label={composer.useForeground ? "Stop adding the foreground color to the prompt" : "Add the foreground color to the prompt"}
                aria-pressed={composer.useForeground}
                onClick={() => controller.toggleForeground()}
              ><Palette className="size-3.5" /></Button>
            </TooltipTrigger>
            <TooltipContent>{composer.useForeground ? "Using the foreground color" : "Use the foreground color"}</TooltipContent>
          </Tooltip>
        )}
        <div className="min-w-0 flex-1" />
        {splitGenerate ? (
          <GenerateSplitButton busy={busy} disabled={busy || (textRequired && !hasText)} hasText={hasText} onGenerate={generate} />
        ) : (
          <Button size="icon" className="size-8 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90" onClick={() => generate()} disabled={busy || (textRequired && !hasText)} aria-label="Generate image">
            {busy ? <RefreshCw className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}
