import type { ModuleKey, Permission } from "@stockflow/schemas";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  KeyRound,
  Landmark,
  LayoutDashboard,
  MapPinned,
  Package,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  key: string;
  href: string;
  icon: LucideIcon;
  module?: ModuleKey;
  permission?: Permission;
  /** Delivery phase for modules that are not built yet. */
  phase?: number;
}

export interface NavGroup {
  key: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  { key: "overview", items: [{ key: "dashboard", href: "/dashboard", icon: LayoutDashboard }] },
  {
    key: "operations",
    items: [
      { key: "inventory", href: "/inventory", icon: Package, module: "inventory", permission: "inventory.view", phase: 1 },
      { key: "purchasing", href: "/purchasing", icon: Truck, module: "purchasing", permission: "purchasing.view", phase: 2 },
      { key: "sales", href: "/sales", icon: ShoppingCart, module: "sales", permission: "sales.view", phase: 3 },
      { key: "orders", href: "/orders", icon: ClipboardCheck, module: "orders", phase: 3 },
    ],
  },
  {
    key: "insights",
    items: [
      { key: "finance", href: "/finance", icon: Landmark, module: "finance", permission: "finance.view", phase: 4 },
      { key: "reports", href: "/reports", icon: BarChart3, module: "reports", permission: "reports.view", phase: 5 },
      { key: "maps", href: "/maps", icon: MapPinned, module: "maps", phase: 5 },
    ],
  },
  {
    key: "settings",
    items: [
      { key: "company", href: "/settings/company", icon: Building2, permission: "organization.view" },
      { key: "users", href: "/settings/users", icon: Users, permission: "users.view" },
      { key: "roles", href: "/settings/roles", icon: KeyRound, permission: "roles.view" },
      { key: "security", href: "/settings/security", icon: ShieldCheck },
      { key: "audit", href: "/settings/audit", icon: ScrollText, permission: "audit.view" },
    ],
  },
];

/** Module pages that exist as placeholders until their phase ships. */
export const PLANNED_MODULES = NAV.flatMap((g) => g.items).filter((i) => i.phase);

export function visibleNav(modules: string[], permissions: string[]): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => (!i.module || modules.includes(i.module)) && (!i.permission || permissions.includes(i.permission))),
  })).filter((g) => g.items.length > 0);
}
