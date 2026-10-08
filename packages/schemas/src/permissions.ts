/**
 * Permission keys follow `<module>.<action>`. They are the single source of truth
 * for RBAC on the API (guards) and for hiding UI on web/mobile.
 */
export const PERMISSION_GROUPS = {
  organization: ["organization.view", "organization.manage"],
  users: ["users.view", "users.invite", "users.manage"],
  roles: ["roles.view", "roles.manage"],
  audit: ["audit.view"],
  products: ["products.view", "products.manage"],
  warehouses: ["warehouses.view", "warehouses.manage"],
  inventory: ["inventory.view", "inventory.stock_in", "inventory.stock_out", "inventory.adjust", "inventory.transfer", "inventory.count"],
  purchasing: ["purchasing.view", "purchasing.manage", "purchasing.approve", "purchasing.receive"],
  sales: ["sales.view", "sales.manage", "sales.approve", "sales.dispatch"],
  finance: ["finance.view", "finance.manage", "finance.post"],
  reports: ["reports.view", "reports.export"],
} as const;

export type PermissionGroup = keyof typeof PERMISSION_GROUPS;
export type Permission = (typeof PERMISSION_GROUPS)[PermissionGroup][number];

export const ALL_PERMISSIONS = Object.values(PERMISSION_GROUPS).flat() as Permission[];

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}

const viewAll = ALL_PERMISSIONS.filter((p) => p.endsWith(".view"));

export interface SystemRoleDefinition {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
}

/** Roles created for every organization. `owner` cannot be edited or deleted. */
export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  { key: "owner", name: "Owner", description: "Full access to everything", permissions: ALL_PERMISSIONS },
  {
    key: "admin",
    name: "Administrator",
    description: "Manages users, settings and all modules",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "organization.manage"),
  },
  {
    key: "manager",
    name: "Manager",
    description: "Runs daily operations and approves documents",
    permissions: [
      ...viewAll,
      "products.manage", "warehouses.manage",
      "inventory.stock_in", "inventory.stock_out", "inventory.adjust", "inventory.transfer", "inventory.count",
      "purchasing.manage", "purchasing.approve", "purchasing.receive",
      "sales.manage", "sales.approve", "sales.dispatch",
      "reports.export",
    ],
  },
  {
    key: "storekeeper",
    name: "Storekeeper",
    description: "Receives, issues and counts stock",
    permissions: [
      "products.view", "warehouses.view", "inventory.view",
      "inventory.stock_in", "inventory.stock_out", "inventory.transfer", "inventory.count",
      "purchasing.view", "purchasing.receive", "sales.view", "sales.dispatch",
    ],
  },
  {
    key: "sales",
    name: "Sales",
    description: "Creates quotations, orders and invoices",
    permissions: ["products.view", "inventory.view", "sales.view", "sales.manage", "reports.view"],
  },
  {
    key: "accountant",
    name: "Accountant",
    description: "Manages receipts, payments and financial reports",
    permissions: [...viewAll.filter((p) => p !== "users.view" && p !== "roles.view"), "finance.manage", "finance.post", "reports.export"],
  },
  { key: "viewer", name: "Viewer", description: "Read-only access", permissions: viewAll.filter((p) => p !== "audit.view") },
];
