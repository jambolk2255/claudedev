"use client";

import type { AuthUser } from "@stockflow/schemas";
import { Bell, LogOut, Menu, Search, ShieldCheck, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";

export function Topbar({ user, onMenu, onSearch, onLogout }: { user: AuthUser; onMenu: () => void; onSearch: () => void; onLogout: () => void }) {
  const t = useTranslations("topbar");
  const router = useRouter();

  return (
    <header className="bg-background/75 sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-4 backdrop-blur-xl sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label={t("menu")}>
        <Menu />
      </Button>
      <button
        type="button"
        onClick={onSearch}
        className="bg-card text-muted-foreground shadow-xs hover:border-primary/40 flex h-9 w-full min-w-0 max-w-sm items-center gap-2 rounded-lg border px-3 text-sm transition"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate text-left">{t("search")}</span>
        <kbd className="bg-muted hidden rounded border px-1.5 text-[10px] font-medium sm:inline">Ctrl K</kbd>
      </button>
      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <LocaleSwitcher persist />
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("notifications")}>
              <Bell />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>{t("notifications")}</DropdownMenuLabel>
            <div className="text-muted-foreground grid place-items-center gap-2 px-4 py-8 text-center text-sm">
              <Bell className="size-6 opacity-40" />
              {t("noNotifications")}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hover:ring-ring focus-visible:ring-ring ml-1 rounded-full transition hover:ring-4 focus-visible:outline-none focus-visible:ring-4"
              aria-label={t("account")}
            >
              <Avatar name={user.name} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <div className="flex items-center gap-3 px-2.5 py-2">
              <Avatar name={user.name} className="size-9" />
              <div className="grid min-w-0">
                <span className="truncate text-sm font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-xs">{user.email}</span>
              </div>
            </div>
            <DropdownMenuLabel className="pt-0">
              {user.role.name} · {user.organization.name}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/settings/security")}>
              <ShieldCheck /> {t("security")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/settings/security#profile")}>
              <UserRound /> {t("profile")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onLogout}>
              <LogOut /> {t("logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
