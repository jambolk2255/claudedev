"use client";

import type { AuthUser } from "@stockflow/schemas";
import { Bell, ChevronRight, Menu, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Link, usePathname } from "@/i18n/navigation";
import { CreateMenu } from "./create-menu";
import { findPage } from "./nav";

function Breadcrumbs() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { section, item } = findPage(pathname);
  if (!item) return null;
  return (
    <nav aria-label={t("breadcrumb")} className="flex min-w-0 items-center gap-1.5 text-sm">
      {section && (
        <>
          {section === "settings" ? (
            <Link href="/settings" className="text-muted-foreground hover:text-foreground hidden truncate sm:inline">
              {t("items.settings")}
            </Link>
          ) : (
            <span className="text-muted-foreground hidden truncate sm:inline">{t(`groups.${section}`)}</span>
          )}
          <ChevronRight className="text-muted-foreground/60 hidden size-3.5 shrink-0 sm:inline" />
        </>
      )}
      <span className="truncate font-medium">{t(`items.${item.key}`)}</span>
    </nav>
  );
}

export function Topbar({ user, onMenu, onSearch }: { user: AuthUser; onMenu: () => void; onSearch: () => void }) {
  const t = useTranslations("topbar");

  return (
    <header className="bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur-xl sm:px-6">
      <Button variant="ghost" size="icon" className="-ml-1 lg:hidden" onClick={onMenu} aria-label={t("menu")}>
        <Menu />
      </Button>
      <Breadcrumbs />
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onSearch}
          aria-label={t("search")}
          className="bg-card text-muted-foreground shadow-xs hover:text-foreground flex h-8 items-center gap-2 rounded-md border px-2.5 text-sm transition-colors md:w-64"
        >
          <Search className="size-4" />
          <span className="hidden flex-1 text-left md:inline">{t("search")}</span>
          <kbd className="bg-muted hidden rounded px-1.5 text-[10px] font-medium md:inline">Ctrl K</kbd>
        </button>
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
        <CreateMenu user={user} />
      </div>
    </header>
  );
}
