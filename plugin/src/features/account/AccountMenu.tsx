// Adapted from the Photoshop plugin's AccountMenu and Avatar (App.tsx, commit ffe30c1b).
import { ChevronDown, CreditCard, Eraser, LogOut, RefreshCw } from "lucide-react";
import { useAction, useAppState, useController } from "../../app/hooks";
import { Button } from "../../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { avatarColor, avatarInitial } from "../../lib/avatar";
import { cn } from "../../lib/utils";

export function Avatar({ className }: { className?: string }) {
  const { account } = useAppState();
  const email = account?.email ?? "";
  return (
    <span
      className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white", className)}
      style={{ backgroundColor: avatarColor(email) }}
      aria-hidden="true"
    >{avatarInitial(account?.name, email)}</span>
  );
}

export function AccountMenu() {
  const controller = useController();
  const state = useAppState();
  const run = useAction();
  const email = state.account?.email ?? "";
  const payerSelf = state.account?.payer.self ?? true;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 gap-1 rounded-full px-1.5" aria-label={`Account for ${email || "Astria"}`}>
          <Avatar />
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={8}>
        {email && <p className="truncate px-2.5 pb-1.5 pt-1 text-[11px] text-muted-foreground" title={email}>{email}</p>}
        {payerSelf && <DropdownMenuItem onSelect={() => controller.openAddBalance()}><CreditCard className="size-4" />Add balance</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => run("Refresh balance", () => controller.refreshBalance())}><RefreshCw className="size-4" />Refresh balance</DropdownMenuItem>
        {state.host !== "not-embedded" && (
          <DropdownMenuItem onSelect={() => run("Cleaning up", () => controller.cleanupHost())}><Eraser className="size-4" />Remove leftover temporary layers</DropdownMenuItem>
        )}
        <DropdownMenuSeparator className="my-1 h-px bg-border" />
        <DropdownMenuItem className="text-red-400 data-[highlighted]:bg-red-500/10 data-[highlighted]:text-red-300" onSelect={() => controller.signOut()}><LogOut className="size-4" />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
