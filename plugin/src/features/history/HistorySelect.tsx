// Adapted from the Photoshop plugin's HistorySelect (App.tsx, commit ffe30c1b).
// Nothing stays selected: picking a row loads that prompt into the composer.
import * as React from "react";
import { Star, Trash2 } from "lucide-react";
import { useAppState, useController } from "../../app/hooks";
import { SearchableSelect, type SelectOption } from "../../components/ui/searchable-select";
import { cn } from "../../lib/utils";

export function HistorySelect() {
  const controller = useController();
  const { history } = useAppState();
  const [starredOnly, setStarredOnly] = React.useState(false);
  const options = React.useMemo<SelectOption[]>(
    () => history.filter((entry) => !starredOnly || entry.starred).map(({ text }) => ({ value: text, label: text, icon: "clock" })),
    [history, starredOnly]
  );
  const isStarred = (option: SelectOption) => history.some((entry) => entry.text === option.value && entry.starred);
  return (
    <SearchableSelect
      options={options}
      value={null}
      onChange={(prompt) => controller.reusePrompt(prompt)}
      placeholder="History"
      searchPlaceholder={starredOnly ? "Search starred prompts" : "Search prompts"}
      toggleIcon="clock"
      ariaLabel="Prompt history"
      emptyMessage={starredOnly ? "No starred prompts yet" : "No prompts yet"}
      width={320}
      labelClassName="max-[379px]:hidden"
      onStar={(option) => controller.setPromptStarred(option.value, !isStarred(option))}
      isStarred={isStarred}
      onRemove={(option) => controller.removePrompt(option.value)}
      removeLabel="Remove from history"
      footer={
        (history.length > 0 || starredOnly) && (
          <>
            <button
              type="button"
              aria-pressed={starredOnly}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground outline-none hover:bg-white/10 hover:text-foreground focus-visible:bg-white/10"
              onClick={() => setStarredOnly((current) => !current)}
            >
              <Star className={cn("size-3.5", starredOnly && "fill-current text-primary")} />
              {starredOnly ? "Show all prompts" : "Show starred prompts"}
            </button>
            {history.some((entry) => !entry.starred) && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground outline-none hover:bg-white/10 hover:text-foreground focus-visible:bg-white/10"
                onClick={() => controller.clearPrompts()}
              >
                <Trash2 className="size-3.5" />
                Clear unstarred history
              </button>
            )}
          </>
        )
      }
    />
  );
}
