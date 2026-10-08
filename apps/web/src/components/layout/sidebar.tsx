"use client";

import type { AuthUser } from "@stockflow/schemas";
import { PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { LogoMark } from "@/components/brand";
import { Tooltip } from "@/components/ui/tooltip";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { visibleNav, type NavItem } from "./nav";
import { UserMenu } from "./user-menu";

function NavLink({
  item,
  label,
  active,
  collapsed,
  onNavigate,
  soon,
}: {
  item: NavItem;
  label: string;
  active: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
  soon?: string;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
        active ? "text-foreground font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          className="bg-card shadow-card ring-border absolute inset-0 rounded-md ring-1"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      <Icon className={cn("relative size-4 shrink-0", active ? "text-primary" : item.phase && "opacity-70")} />
      {!collapsed && <span className={cn("relative flex-1 truncate", item.phase && !active && "opacity-80")}>{label}</span>}
      {!collapsed && soon && <span className="text-muted-foreground/70 relative text-[10px] font-medium uppercase tracking-wide">{soon}</span>}
    </Link>
  );
  return collapsed ? (
    <Tooltip content={label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

export function SidebarNav({ user, collapsed, onNavigate }: { user: AuthUser; collapsed?: boolean; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const groups = visibleNav(user.organization.modules, user.permissions);

  return (
    <nav className="grid gap-4" aria-label={t("label")}>
      {groups.map((group) => (
        <div key={group.key} className="grid gap-0.5">
          {!collapsed && group.key !== "overview" && <p className="text-muted-foreground/80 px-2.5 pb-1 text-[11px] font-medium">{t(`groups.${group.key}`)}</p>}
          {group.items.map((item) => (
            <NavLink
              key={item.key}
              item={item}
              label={t(`items.${item.key}`)}
              active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
              collapsed={collapsed}
              onNavigate={onNavigate}
              soon={item.phase ? t("soon") : undefined}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Company block shown at the top of the sidebar. */
export function WorkspaceHeader({ user, collapsed }: { user: AuthUser; collapsed?: boolean }) {
  const t = useTranslations("dashboard.mode");
  return (
    <Link href="/dashboard" className={cn("hover:bg-accent flex items-center gap-2.5 rounded-md p-1.5 transition-colors", collapsed && "justify-center")}>
      <LogoMark className="size-8 shrink-0" />
      {!collapsed && (
        <span className="grid min-w-0 leading-tight">
          <span className="truncate text-sm font-semibold">{user.organization.name}</span>
          <span className="text-muted-foreground truncate text-xs">
            {t(user.organization.mode)} · {user.organization.currency}
          </span>
        </span>
      )}
    </Link>
  );
}

export function SidebarFooter({
  user,
  collapsed,
  onLogout,
  onNavigate,
}: {
  user: AuthUser;
  collapsed?: boolean;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <div className="grid gap-1">
      <NavLink
        item={{ key: "settings", href: "/settings", icon: Settings }}
        label={t("items.settings")}
        active={pathname.startsWith("/settings")}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
      <UserMenu user={user} collapsed={collapsed} onLogout={onLogout} />
    </div>
  );
}

export function Sidebar({ user, collapsed, onToggle, onLogout }: { user: AuthUser; collapsed: boolean; onToggle: () => void; onLogout: () => void }) {
  const t = useTranslations("nav");
  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ type: "spring", stiffness: 400, damping: 40 }}
      className="bg-sidebar sticky top-0 hidden h-dvh shrink-0 flex-col border-r lg:flex print:hidden"
    >
      <div className="flex h-14 items-center gap-1 px-2.5">
        <div className="min-w-0 flex-1">
          <WorkspaceHeader user={user} collapsed={collapsed} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 py-3">
        <SidebarNav user={user} collapsed={collapsed} />
      </div>
      <div className="border-t p-2.5">
        <SidebarFooter user={user} collapsed={collapsed} onLogout={onLogout} />
        <button
          type="button"
          onClick={onToggle}
          className="text-muted-foreground hover:bg-accent hover:text-foreground mt-1 flex h-7 w-full items-center justify-center gap-2 rounded-md text-xs transition-colors"
          aria-label={collapsed ? t("expand") : t("collapse")}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && t("collapse")}
        </button>
      </div>
    </motion.aside>
  );
}
