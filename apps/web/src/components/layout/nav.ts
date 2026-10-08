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
  CreditCard,
  LayoutDashboard,
  Server,
  MonitorSmartphone,
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
  /** Only in SaaS mode (the company has a subscription). */
  saasOnly?: boolean;
  /** Only for platform operators. */
  platformOnly?: boolean;
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
      { key: "purchasing", href: "/purchasing", icon: Truck, module: "purchasing", permission: "purchasing.view" },
      { key: "sales", href: "/sales", icon: ShoppingCart, module: "sales", permission: "sales.view" },
      { key: "orders", href: "/orders", icon: ClipboardCheck, module: "orders" },
    ],
  },
  {
    key: "insights",
    items: [
      { key: "finance", href: "/finance", icon: Landmark, module: "finance", permission: "finance.view" },
      { key: "reports", href: "/reports", icon: BarChart3, module: "reports", permission: "reports.view" },
      { key: "maps", href: "/maps", icon: MapPinned, module: "maps" },
    ],
  },
  { key: "platform", items: [{ key: "platform", href: "/admin", icon: Server, platformOnly: true }] },
];

/** Secondary navigation inside the Settings area. */
export const SETTINGS_NAV: NavItem[] = [
  { key: "company", href: "/settings/company", icon: Building2, permission: "organization.view" },
  { key: "users", href: "/settings/users", icon: Users, permission: "users.view" },
  { key: "roles", href: "/settings/roles", icon: KeyRound, permission: "roles.view" },
  { key: "security", href: "/settings/security", icon: ShieldCheck },
  { key: "audit", href: "/settings/audit", icon: ScrollText, permission: "audit.view" },
  { key: "billing", href: "/settings/billing", icon: CreditCard, permission: "organization.view", saasOnly: true },
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
  { key: "purchaseOrder", icon: FileText, group: "purchasing", href: "/purchasing/orders/new", module: "purchasing", permission: "purchasing.manage" },
  { key: "grn", icon: PackageCheck, group: "purchasing", href: "/purchasing", module: "purchasing", permission: "purchasing.receive" },
  { key: "quotation", icon: ScrollText, group: "sales", href: "/sales/quotations/new", module: "sales", permission: "sales.manage" },
  { key: "salesOrder", icon: ShoppingCart, group: "sales", href: "/sales/orders/new", module: "sales", permission: "sales.manage" },
  { key: "invoice", icon: FileText, group: "sales", href: "/sales/invoices/new", module: "sales", permission: "sales.manage" },
  { key: "quickSale", icon: MonitorSmartphone, group: "sales", href: "/sales/pos", module: "sales", permission: "sales.dispatch" },
  { key: "customer", icon: Contact, group: "people", href: "/contacts/customers?new=1", permission: "sales.manage" },
  { key: "supplier", icon: Truck, group: "people", href: "/contacts/suppliers?new=1", permission: "purchasing.manage" },
  { key: "inviteUser", icon: UserPlus, group: "people", href: "/settings/users?invite=1", permission: "users.invite" },
];

export interface NavAccess {
  platformAdmin?: boolean;
  saas?: boolean;
}

const allowed = (item: { module?: ModuleKey; permission?: Permission }, modules: string[], permissions: string[]) =>
  (!item.module || modules.includes(item.module)) && (!item.permission || permissions.includes(item.permission));
const accessible = (item: NavItem, access: NavAccess) => (!item.platformOnly || !!access.platformAdmin) && (!item.saasOnly || !!access.saas);

export function visibleNav(modules: string[], permissions: string[], access: NavAccess = {}): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => allowed(i, modules, permissions) && accessible(i, access)) })).filter((g) => g.items.length > 0);
}

export function visibleSettings(permissions: string[], access: NavAccess = {}): NavItem[] {
  return SETTINGS_NAV.filter((i) => allowed(i, [], permissions) && accessible(i, access));
}

export const navAccess = (user: { platformAdmin: boolean; subscription: unknown }): NavAccess => ({
  platformAdmin: user.platformAdmin,
  saas: !!user.subscription,
});

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
