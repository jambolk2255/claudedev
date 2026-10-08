"use client";

import type { AuthUser } from "@stockflow/schemas";
import { ChevronsLeft } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { visibleNav } from "./nav";

export function SidebarNav({ user, collapsed, onNavigate }: { user: AuthUser; collapsed?: boolean; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const groups = visibleNav(user.organization.modules, user.permissions);

  return (
    <nav className="grid gap-5" aria-label={t("label")}>
      {groups.map((group) => (
        <div key={group.key} className="grid gap-0.5">
          {!collapsed && <p className="text-muted-foreground/80 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider">{t(`groups.${group.key}`)}</p>}
          {group.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            const link = (
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  collapsed && "justify-center px-0",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active"
                    className="bg-card ring-border absolute inset-0 rounded-lg shadow-sm ring-1"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  >
                    <span className="bg-brand absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-full" />
                  </motion.span>
                )}
                <Icon className={cn("relative size-[18px] shrink-0 transition-colors", active && "text-primary")} />
                {!collapsed && <span className="relative flex-1 truncate">{t(`items.${item.key}`)}</span>}
                {!collapsed && item.phase && (
                  <Badge variant="outline" className="relative px-1.5 text-[10px]">
                    {t("soon")}
                  </Badge>
                )}
              </Link>
            );
            return collapsed ? (
              <Tooltip key={item.key} content={t(`items.${item.key}`)} side="right">
                {link}
              </Tooltip>
            ) : (
              <div key={item.key}>{link}</div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ user, collapsed, onToggle }: { user: AuthUser; collapsed: boolean; onToggle: () => void }) {
  const t = useTranslations("nav");
  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 256 }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      className="bg-sidebar sticky top-0 hidden h-dvh shrink-0 flex-col border-r lg:flex"
    >
      <div className={cn("flex h-16 items-center px-4", collapsed ? "justify-center" : "justify-between")}>
        <Link href="/dashboard" aria-label="StockFlow">
          <Logo withText={!collapsed} />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <SidebarNav user={user} collapsed={collapsed} />
      </div>
      <div className="border-t p-3">
        <button
          type="button"
          onClick={onToggle}
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-9 w-full items-center justify-center gap-2 rounded-lg text-sm transition"
          aria-label={collapsed ? t("expand") : t("collapse")}
        >
          <motion.span animate={{ rotate: collapsed ? 180 : 0 }}>
            <ChevronsLeft className="size-4" />
          </motion.span>
          {!collapsed && t("collapse")}
        </button>
      </div>
    </motion.aside>
  );
}
