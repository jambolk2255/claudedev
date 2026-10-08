import type { ModuleKey, Permission } from "@stockflow/schemas";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BookUser,
  ClipboardList,
  Contact,
  PackagePlus,
  SlidersHorizontal,
  BarChart3,
  Building2,
  ClipboardCheck,
  FileText,
  KeyRound,
  Landmark,
  LayoutDashboard,
  MapPinned,
  Package,
  PackageCheck,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserPlus,
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
      { key: "inventory", href: "/inventory", icon: Package, module: "inventory", permission: "inventory.view" },
      { key: "contacts", href: "/contacts", icon: BookUser },
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
];

/** Secondary navigation inside the Settings area. */
export const SETTINGS_NAV: NavItem[] = [
  { key: "company", href: "/settings/company", icon: Building2, permission: "organization.view" },
  { key: "users", href: "/settings/users", icon: Users, permission: "users.view" },
  { key: "roles", href: "/settings/roles", icon: KeyRound, permission: "roles.view" },
  { key: "security", href: "/settings/security", icon: ShieldCheck },
  { key: "audit", href: "/settings/audit", icon: ScrollText, permission: "audit.view" },
];

export interface CreateAction {
  key: string;
  icon: LucideIcon;
  group: "inventory" | "purchasing" | "sales" | "people";
  href?: string;
  module?: ModuleKey;
  permission?: Permission;
  phase?: number;
}

/** Everything a user can create, in one place (topbar "Create" menu and dashboard quick actions). */
export const CREATE_ACTIONS: CreateAction[] = [
  {
    key: "stockIn",
    icon: ArrowDownToLine,
    group: "inventory",
    href: "/inventory/documents/new?type=stock_in",
    module: "inventory",
    permission: "inventory.stock_in",
  },
  {
    key: "stockOut",
    icon: ArrowUpFromLine,
    group: "inventory",
    href: "/inventory/documents/new?type=stock_out",
    module: "inventory",
    permission: "inventory.stock_out",
  },
  {
    key: "adjustment",
    icon: SlidersHorizontal,
    group: "inventory",
    href: "/inventory/documents/new?type=adjustment",
    module: "inventory",
    permission: "inventory.adjust",
  },
  { key: "count", icon: ClipboardList, group: "inventory", href: "/inventory/documents/new?type=count", module: "inventory", permission: "inventory.count" },
  {
    key: "transfer",
    icon: ArrowLeftRight,
    group: "inventory",
    href: "/inventory/documents/new?type=transfer",
    module: "multiWarehouse",
    permission: "inventory.transfer",
  },
  { key: "product", icon: PackagePlus, group: "inventory", href: "/inventory/products?new=1", permission: "products.manage" },
  { key: "purchaseOrder", icon: FileText, group: "purchasing", module: "purchasing", permission: "purchasing.manage", phase: 2 },
  { key: "grn", icon: PackageCheck, group: "purchasing", module: "purchasing", permission: "purchasing.receive", phase: 2 },
  { key: "salesOrder", icon: ShoppingCart, group: "sales", module: "sales", permission: "sales.manage", phase: 3 },
  { key: "invoice", icon: FileText, group: "sales", module: "sales", permission: "sales.manage", phase: 3 },
  { key: "customer", icon: Contact, group: "people", href: "/contacts/customers?new=1", permission: "sales.manage" },
  { key: "supplier", icon: Truck, group: "people", href: "/contacts/suppliers?new=1", permission: "purchasing.manage" },
  { key: "inviteUser", icon: UserPlus, group: "people", href: "/settings/users?invite=1", permission: "users.invite" },
];

/** Module pages that exist as placeholders until their phase ships. */
export const PLANNED_MODULES = NAV.flatMap((g) => g.items).filter((i) => i.phase);

const allowed = (item: { module?: ModuleKey; permission?: Permission }, modules: string[], permissions: string[]) =>
  (!item.module || modules.includes(item.module)) && (!item.permission || permissions.includes(item.permission));

export function visibleNav(modules: string[], permissions: string[]): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => allowed(i, modules, permissions)) })).filter((g) => g.items.length > 0);
}

export function visibleSettings(permissions: string[]): NavItem[] {
  return SETTINGS_NAV.filter((i) => allowed(i, [], permissions));
}

export function visibleCreateActions(modules: string[], permissions: string[]): CreateAction[] {
  return CREATE_ACTIONS.filter((a) => allowed(a, modules, permissions));
}

/** Resolves the current page for breadcrumbs. */
export function findPage(pathname: string): { section?: string; item?: NavItem } {
  const settings = SETTINGS_NAV.find((i) => pathname.startsWith(i.href));
  if (settings) return { section: "settings", item: settings };
  for (const g of NAV) {
    const item = g.items.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
    if (item) return { section: g.key === "overview" ? undefined : g.key, item };
  }
  return {};
}
