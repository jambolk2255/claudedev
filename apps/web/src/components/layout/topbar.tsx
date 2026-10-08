"use client";

import type { AuthUser, StockAlert } from "@stockflow/schemas";
import { useQuery } from "@tanstack/react-query";
import { Bell, ChevronRight, Menu, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertRow } from "@/components/inventory/alerts-list";
import { Link, usePathname } from "@/i18n/navigation";
import { api } from "@/lib/api";
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
  const alertsOn = user.organization.modules.includes("inventory") && user.permissions.includes("inventory.view");
  const alerts = useQuery({ queryKey: ["stock", "alerts"], queryFn: () => api<StockAlert[]>("/stock/alerts"), enabled: alertsOn, refetchInterval: 120_000 });
  const alertCount = alerts.data?.length ?? 0;

  return (
    <header className="bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur-xl sm:px-6 print:hidden">
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
            <Button
              variant="ghost"
              size="icon"
              aria-label={alertCount ? t("notificationsCount", { count: alertCount }) : t("notifications")}
              className="relative"
            >
              <Bell />
              {alertCount > 0 && (
                <span className="bg-destructive text-destructive-foreground absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-content-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
                  {alertCount > 99 ? "99+" : alertCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-2">
            <DropdownMenuLabel className="px-1">{t("notifications")}</DropdownMenuLabel>
            {alertCount === 0 ? (
              <div className="text-muted-foreground grid place-items-center gap-2 px-4 py-8 text-center text-sm">
                <Bell className="size-6 opacity-40" />
                {t("noNotifications")}
              </div>
            ) : (
              <>
                <div className="grid max-h-80 overflow-y-auto px-2">
                  {alerts.data!.slice(0, 8).map((a, i) => (
                    <AlertRow key={`${a.type}-${a.productId}-${a.batchNo ?? i}`} alert={a} />
                  ))}
                </div>
                <Link href="/inventory" className="text-primary mt-1 block rounded-md px-2 py-2 text-center text-sm font-medium hover:underline">
                  {t("viewAllAlerts")}
                </Link>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <CreateMenu user={user} />
      </div>
    </header>
  );
}
