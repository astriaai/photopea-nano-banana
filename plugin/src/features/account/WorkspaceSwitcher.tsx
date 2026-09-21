// Adapted from the Photoshop plugin's WorkspaceSwitcher (App.tsx, commit ffe30c1b).
import * as React from "react";
import { useAction, useAppState, useController } from "../../app/hooks";
import { SearchableSelect, type SelectOption } from "../../components/ui/searchable-select";

/** `selectedId` value for Personal (no X-Workspace-Id sent). */
export const PERSONAL_WORKSPACE = "";

export function WorkspaceSwitcher() {
  const controller = useController();
  const { workspaces, job } = useAppState();
  const run = useAction();
  const options = React.useMemo<SelectOption[]>(() => [
    { value: PERSONAL_WORKSPACE, label: "Personal", icon: "folder" },
    ...workspaces.list.map((workspace) => ({ value: workspace.id, label: workspace.title, icon: "folder", iconUrl: workspaces.favicons[workspace.faviconUrl] || null }))
  ], [workspaces.list, workspaces.favicons]);
  return (
    <SearchableSelect
      options={options}
      value={workspaces.selectedId}
      onChange={(value) => run("Switching workspace", () => controller.setWorkspace(value))}
      onOpen={() => run("Refreshing workspaces", () => controller.loadWorkspaces())}
      placeholder="Personal"
      searchPlaceholder="Search workspaces"
      toggleIcon="folder"
      ariaLabel="Switch workspace"
      status={workspaces.status === "error" ? workspaces.error : ""}
      width={260}
      disabled={job.status === "working"}
      className="min-w-0 max-w-[140px]"
      labelClassName="font-semibold max-[379px]:hidden"
    />
  );
}
