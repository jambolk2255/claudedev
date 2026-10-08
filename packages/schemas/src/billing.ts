import { z } from "zod";
import { MODULE_KEYS, type ModuleKey } from "./modules";

// ─── Plans & subscriptions (SaaS mode) ───────────────────────────────────────

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "suspended", "cancelled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];
export const PLATFORM_INVOICE_STATUSES = ["pending", "paid", "cancelled", "failed"] as const;
export type PlatformInvoiceStatus = (typeof PLATFORM_INVOICE_STATUSES)[number];
export const PLATFORM_PAYMENT_METHODS = ["payhere", "bank_transfer", "manual"] as const;
export type PlatformPaymentMethod = (typeof PLATFORM_PAYMENT_METHODS)[number];

/** Days after a paid period ends before the account becomes read-only. */
export const GRACE_DAYS = 3;
export const LIMIT_KEYS = ["users", "warehouses", "products"] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

export interface PlanDefinition {
  code: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  maxUsers: number | null;
  maxWarehouses: number | null;
  maxProducts: number | null;
  modules: ModuleKey[];
  sortOrder: number;
}

const BASIC: ModuleKey[] = ["inventory", "purchasing", "sales", "orders", "barcodes", "pos"];

/** Plans created on first start; the platform admin can edit prices and limits afterwards. Prices in LKR. */
export const DEFAULT_PLANS: PlanDefinition[] = [
  {
    code: "starter",
    name: "Starter",
    description: "A single shop: stock, purchasing, sales and quick sale",
    priceMonthly: 2900,
    priceYearly: 29000,
    maxUsers: 3,
    maxWarehouses: 1,
    maxProducts: 1000,
    modules: BASIC,
    sortOrder: 1,
  },
  {
    code: "business",
    name: "Business",
    description: "Growing businesses: finance, reports, maps and several warehouses",
    priceMonthly: 7900,
    priceYearly: 79000,
    maxUsers: 10,
    maxWarehouses: 5,
    maxProducts: 10000,
    modules: [...BASIC, "finance", "reports", "maps", "multiWarehouse", "batches"],
    sortOrder: 2,
  },
  {
    code: "enterprise",
    name: "Enterprise",
    description: "Unlimited users, warehouses and products with every module",
    priceMonthly: 19900,
    priceYearly: 199000,
    maxUsers: null,
    maxWarehouses: null,
    maxProducts: null,
    modules: [...MODULE_KEYS],
    sortOrder: 3,
  },
];

export interface SubscriptionLike {
  status: SubscriptionStatus;
  trialEndsAt: Date | string | null;
  currentPeriodEnd: Date | string | null;
}

export interface SubscriptionState {
  status: SubscriptionStatus | "expired";
  /** Data can be viewed and exported but not changed. */
  readOnly: boolean;
  /** Nothing but billing is available. */
  blocked: boolean;
  /** Days until the trial or paid period ends (negative when past). */
  daysLeft: number | null;
}

const DAY = 86_400_000;

/** Effective state of a subscription at a point in time (shared by API guard and UI banners). */
export function subscriptionState(sub: SubscriptionLike, now = new Date()): SubscriptionState {
  const end = sub.status === "trialing" ? sub.trialEndsAt : sub.currentPeriodEnd;
  const endMs = end ? new Date(end).getTime() : null;
  const daysLeft = endMs === null ? null : Math.ceil((endMs - now.getTime()) / DAY);
  if (sub.status === "suspended") return { status: "suspended", readOnly: true, blocked: true, daysLeft };
  if (endMs === null) return { status: sub.status, readOnly: false, blocked: false, daysLeft };
  if (sub.status === "trialing")
    return endMs < now.getTime()
      ? { status: "expired", readOnly: true, blocked: false, daysLeft }
      : { status: "trialing", readOnly: false, blocked: false, daysLeft };
  if (endMs + GRACE_DAYS * DAY < now.getTime()) return { status: "expired", readOnly: true, blocked: false, daysLeft };
  if (endMs < now.getTime())
    return { status: sub.status === "cancelled" ? "expired" : "past_due", readOnly: sub.status === "cancelled", blocked: false, daysLeft };
  return { status: sub.status, readOnly: false, blocked: false, daysLeft };
}

/** Adds one billing interval to a date (month-end safe). */
export function addInterval(from: Date, interval: BillingInterval): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  return d;
}

export const checkoutSchema = z.object({
  planCode: z.string().trim().min(1).max(30),
  interval: z.enum(BILLING_INTERVALS),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const bankTransferSchema = checkoutSchema.extend({
  reference: z.string().trim().min(3).max(120),
});
export type BankTransferInput = z.infer<typeof bankTransferSchema>;

const limit = z.number().int().min(1).max(1_000_000).nullable();
const lkr = z
  .number()
  .finite()
  .min(0)
  .max(100_000_000)
  .refine((v) => Math.round(v * 100) / 100 === v, "max_decimals_money");

export const planInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).default(""),
  priceMonthly: lkr,
  priceYearly: lkr,
  maxUsers: limit,
  maxWarehouses: limit,
  maxProducts: limit,
  modules: z.array(z.enum(MODULE_KEYS)).min(1),
  active: z.boolean().default(true),
});
export type PlanInput = z.infer<typeof planInputSchema>;

export const tenantSubscriptionSchema = z.object({
  planCode: z.string().trim().min(1).max(30),
  status: z.enum(SUBSCRIPTION_STATUSES),
  interval: z.enum(BILLING_INTERVALS),
  /** New end of the trial (trialing) or paid period (other statuses). */
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().max(300).optional(),
});
export type TenantSubscriptionInput = z.infer<typeof tenantSubscriptionSchema>;

export interface PlanSummary extends Omit<PlanDefinition, "modules"> {
  id: string;
  modules: string[];
  currency: string;
  active: boolean;
}

export interface BillingOverview {
  enabled: boolean;
  subscription: {
    status: SubscriptionStatus;
    interval: BillingInterval;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    plan: PlanSummary;
    state: SubscriptionState;
  } | null;
  usage: Record<LimitKey, number>;
  plans: PlanSummary[];
  invoices: {
    id: string;
    number: string;
    amount: string;
    currency: string;
    status: PlatformInvoiceStatus;
    method: PlatformPaymentMethod;
    interval: BillingInterval;
    reference: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    paidAt: string | null;
    createdAt: string;
    plan: { code: string; name: string };
  }[];
  payhere: boolean;
  bankDetails: string | null;
}

export interface PayHereCheckout {
  action: string;
  fields: Record<string, string>;
}
