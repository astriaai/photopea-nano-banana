// Ported from nano-banana-photoshop-uxp/nano-banana/ui-src/src/components/ui/searchable-select.tsx (commit ffe30c1b).
import * as React from "react";
import { Check, ChevronDown, Star, X } from "lucide-react";
import { ICONS } from "../../lib/icons";
import { filterOptions, type SelectOption } from "../../lib/options";
import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export type { SelectOption } from "../../lib/options";

export function MenuIcon({ icon, iconUrl, size = 14, className }: { icon?: string | null; iconUrl?: string | null; size?: number; className?: string }) {
  // An image that fails to load gives way to the `icon` glyph.
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
  if (iconUrl && failedUrl !== iconUrl) {
    return (
      <span className={cn("menu-icon inline-flex shrink-0 overflow-hidden rounded-[3px]", className)} style={{ width: size, height: size }}>
        <img src={iconUrl} alt="" className="size-full object-cover" onError={() => setFailedUrl(iconUrl)} />
      </span>
    );
  }
  if (!icon || !ICONS[icon]) return null;
  return (
    <span
      className={cn("menu-icon inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: ICONS[icon] }}
    />
  );
}

// Searchable dropdown mirroring astria.ai's prompt composer (sdbooth
// SearchableSelect + SelectOptionsPanel): pill toggle with the selected icon,
// search box, group titles, arrow-key navigation, label + muted detail rows and
// a check on the selected row. Two additions the web composer's panel offers
// too: a pinned footer for a trailing action and (ours) an X on every row.
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  header,
  searchPlaceholder,
  toggleIcon,
  searchable = true,
  emptyMessage,
  width = 240,
  disabled,
  ariaLabel,
  className,
  labelClassName,
  status,
  onOpen,
  onRemove,
  onStar,
  isStarred,
  removeLabel,
  footer,
}: {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  header?: string;
  searchPlaceholder?: string;
  toggleIcon?: string;
  searchable?: boolean;
  /** Shown instead of the list when there are no options at all ("No matches" covers a filtered-out list). */
  emptyMessage?: string;
  width?: number;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  /** Extra classes for the toggle's label (weight, responsive hiding). */
  labelClassName?: string;
  /** Muted line above the rows ("Loading workspaces…", a load failure). */
  status?: string;
  /** Runs when the popover opens (the workspace switcher re-fetches its list). */
  onOpen?: () => void;
  /** Puts an X on every row (the History pill forgets one prompt); the popover stays open. */
  onRemove?: (option: SelectOption) => void;
  /** Star action stays open and never picks the row. */
  onStar?: (option: SelectOption) => void;
  isStarred?: (option: SelectOption) => boolean;
  /** Accessible name of that X; defaults to "Remove". */
  removeLabel?: string;
  /** Pinned below the rows, like sdbooth SelectOptionsPanel's footer ("Clear history"). */
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value) || null;
  const toggleText = (selected ? selected.toggleLabel || selected.label : null) || placeholder || "Select…";
  const searchInputPlaceholder = searchPlaceholder || header || placeholder || "Search…";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) onOpen?.();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel || header || placeholder}
          aria-haspopup="listbox"
          aria-expanded={open}
          title={selected?.label || header || placeholder}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-full bg-white/10 px-2.5 text-xs text-foreground outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-primary/70 disabled:opacity-45",
            className
          )}
        >
          <MenuIcon icon={selected?.icon || toggleIcon} iconUrl={selected?.iconUrl} size={14} />
          <span className={cn("max-w-[150px] truncate", labelClassName)}>{toggleText}</span>
          <ChevronDown className="ml-auto size-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        collisionPadding={8}
        style={{ width: `min(${width}px, calc(100vw - 16px))` }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            event.stopPropagation();
          }
        }}
      >
        <OptionsPanel
          options={options}
          value={value}
          onPick={(option) => {
            onChange(option.value);
            setOpen(false);
          }}
          searchable={searchable}
          searchPlaceholder={searchInputPlaceholder}
          header={header}
          emptyMessage={emptyMessage}
          status={status}
          onStar={onStar}
          isStarred={isStarred}
          onRemove={onRemove}
          removeLabel={removeLabel}
          footer={footer}
        />
      </PopoverContent>
    </Popover>
  );
}

function OptionsPanel({
  options,
  value,
  onPick,
  searchable,
  searchPlaceholder,
  header,
  emptyMessage = "No matches",
  status,
  maxHeight = 256,
  onRemove,
  onStar,
  isStarred,
  removeLabel = "Remove",
  footer,
}: {
  options: SelectOption[];
  value: string | null;
  onPick: (option: SelectOption) => void;
  searchable: boolean;
  searchPlaceholder: string;
  header?: string;
  emptyMessage?: string;
  status?: string;
  maxHeight?: number;
  onRemove?: (option: SelectOption) => void;
  /** Star action stays open and never picks the row. */
  onStar?: (option: SelectOption) => void;
  isStarred?: (option: SelectOption) => boolean;
  removeLabel?: string;
  footer?: React.ReactNode;
}) {
  const [query, setQuery] = React.useState("");
  const [highlight, setHighlight] = React.useState(() => Math.max(0, options.findIndex((option) => option.value === value)));
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const listId = React.useId();
  const optionId = (index: number) => `${listId}-option-${index}`;
  const filtered = React.useMemo(() => filterOptions(options, query), [options, query]);

  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  // A row removed through onRemove can leave the highlight past the end of the list.
  React.useEffect(() => {
    if (highlight > 0 && highlight >= filtered.length) setHighlight(Math.max(0, filtered.length - 1));
  }, [filtered.length, highlight]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    // Row actions and footer buttons retain native Enter/Space activation.
    if ((event.target as HTMLElement).closest("button")) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (filtered[highlight]) onPick(filtered[highlight]);
    }
    if (event.key !== "Escape") event.stopPropagation();
  };

  React.useEffect(() => {
    if (!searchable) listRef.current?.focus();
  }, [searchable]);

  return (
    <div onKeyDown={onKeyDown}>
      {header && !searchable && <div className="px-3 pb-1 pt-2.5 text-xs text-muted-foreground">{header}</div>}
      {searchable && (
        <div className="flex items-center gap-2 border-b border-border/70 px-3 py-1.5">
          <MenuIcon icon="search" size={14} className="text-muted-foreground" />
          <input
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={filtered[highlight] ? optionId(highlight) : undefined}
            aria-label={searchPlaceholder}
            className="w-full border-0 bg-transparent p-0 text-xs leading-5 text-foreground outline-none placeholder:text-muted-foreground/70"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setHighlight(0);
            }}
          />
        </div>
      )}
      {status && <div className="px-3 pb-0.5 pt-2 text-[11px] text-muted-foreground">{status}</div>}
      <div ref={listRef} id={listId} role="listbox" aria-label={header || searchPlaceholder} tabIndex={searchable ? -1 : 0} aria-activedescendant={!searchable && filtered[highlight] ? optionId(highlight) : undefined} className="overflow-auto py-1 outline-none" style={{ maxHeight }}>
        {filtered.map((option, index) => (
          <React.Fragment key={option.value}>
            {option.group && option.group !== filtered[index - 1]?.group && (
              <div className="px-3 pb-0.5 pt-2 text-[10px] font-bold uppercase text-muted-foreground">{option.group}</div>
            )}
            {/* The X sits beside the row, not inside it: a button cannot nest a button. */}
            <div className={cn("relative", index === highlight && "bg-white/10")} onMouseEnter={() => setHighlight(index)}>
              <button
                type="button"
                role="option"
                id={optionId(index)}
                data-index={index}
                aria-selected={option.value === value}
                className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs outline-none", (onRemove || onStar) && "pr-8", onRemove && onStar && "pr-14")}
                onClick={() => onPick(option)}
              >
                <MenuIcon icon={option.icon} iconUrl={option.iconUrl} size={15} />
                <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  <span className="truncate">{option.label}</span>
                  {option.detail && <span className="flex-none text-[10px] text-muted-foreground">{option.detail}</span>}
                </span>
                {option.value === value && <Check className="size-3.5 shrink-0" />}
              </button>
              {onStar && (
                <button
                  type="button"
                  className={cn("absolute top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-primary/70", onRemove ? "right-7" : "right-1.5", isStarred?.(option) ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                  aria-label={`Star prompt: ${option.label}`}
                  aria-pressed={!!isStarred?.(option)}
                  title={isStarred?.(option) ? "Unstar prompt" : "Star prompt"}
                  onClick={() => onStar(option)}
                >
                  <Star className={cn("size-3.5", isStarred?.(option) && "fill-current")} />
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground outline-none hover:bg-white/15 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/70"
                  aria-label={removeLabel}
                  title={removeLabel}
                  onClick={() => onRemove(option)}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </React.Fragment>
        ))}
        {!filtered.length && <div className="px-3 py-2 text-xs text-muted-foreground">{options.length ? "No matches" : emptyMessage}</div>}
      </div>
      {footer && <div className="border-t border-border/70">{footer}</div>}
    </div>
  );
}
