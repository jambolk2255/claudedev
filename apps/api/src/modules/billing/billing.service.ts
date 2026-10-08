import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { Prisma, type Plan, type Subscription } from "@prisma/client";
import {
  DEFAULT_PLANS,
  addInterval,
  subscriptionState,
  type BankTransferInput,
  type BillingInterval,
  type BillingOverview,
  type CheckoutInput,
  type LimitKey,
  type PayHereCheckout,
  type PlanSummary,
} from "@stockflow/schemas";
import { createHash } from "node:crypto";
import { env } from "../../config/env";
import type { RequestContext } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

const md5 = (v: string) => createHash("md5").update(v).digest("hex").toUpperCase();
const LIMIT_FIELD: Record<LimitKey, "maxUsers" | "maxWarehouses" | "maxProducts"> = { users: "maxUsers", warehouses: "maxWarehouses", products: "maxProducts" };
type Db = Prisma.TransactionClient | PrismaService;

export const planSummary = (p: Plan): PlanSummary => ({
  id: p.id,
  code: p.code,
  name: p.name,
  description: p.description,
  priceMonthly: Number(p.priceMonthly),
  priceYearly: Number(p.priceYearly),
  currency: p.currency,
  maxUsers: p.maxUsers,
  maxWarehouses: p.maxWarehouses,
  maxProducts: p.maxProducts,
  modules: p.modules,
  active: p.active,
  sortOrder: p.sortOrder,
});

/** SaaS plans, trials, limits and subscription payments. Everything is a no-op unless SAAS_MODE=true. */
@Injectable()
export class BillingService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  get enabled() {
    return env().SAAS_MODE;
  }

  get payhereEnabled() {
    const e = env();
    return !!(e.PAYHERE_MERCHANT_ID && e.PAYHERE_MERCHANT_SECRET);
  }

  isPlatformAdmin(email: string) {
    return env().PLATFORM_ADMIN_EMAILS.includes(email.toLowerCase());
  }

  async onModuleInit() {
    await this.prisma.plan.createMany({
      data: DEFAULT_PLANS.map((p) => ({ ...p, modules: [...p.modules] })),
      skipDuplicates: true,
    });
  }

  /** Starts the free trial for a newly registered company. */
  async startTrial(tx: Db, organizationId: string) {
    if (!this.enabled) return;
    const e = env();
    const plan =
      (await tx.plan.findUnique({ where: { code: e.TRIAL_PLAN } })) ??
      (await tx.plan.findFirstOrThrow({ where: { active: true }, orderBy: { sortOrder: "desc" } }));
    await tx.subscription.create({
      data: { organizationId, planId: plan.id, status: "trialing", trialEndsAt: new Date(Date.now() + e.TRIAL_DAYS * 86_400_000) },
    });
  }

  /** The tenant's subscription, created as a trial for companies that existed before SaaS mode was switched on. */
  async subscriptionFor(organizationId: string): Promise<(Subscription & { plan: Plan }) | null> {
    if (!this.enabled) return null;
    const sub = await this.prisma.subscription.findUnique({ where: { organizationId }, include: { plan: true } });
    if (sub) return sub;
    await this.startTrial(this.prisma, organizationId).catch((err: unknown) => {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    });
    return this.prisma.subscription.findUnique({ where: { organizationId }, include: { plan: true } });
  }

  async stateFor(organizationId: string, email?: string) {
    if (!this.enabled || (email && this.isPlatformAdmin(email))) return null;
    const sub = await this.subscriptionFor(organizationId);
    return sub ? { sub, state: subscriptionState(sub) } : null;
  }

  async usage(organizationId: string): Promise<Record<LimitKey, number>> {
    const db = this.prisma.tenant(organizationId);
    const [users, invites, warehouses, products] = await Promise.all([
      db.user.count({ where: { active: true } }),
      db.invitation.count({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
      db.warehouse.count({ where: { active: true } }),
      db.product.count({ where: { active: true } }),
    ]);
    return { users: users + invites, warehouses, products };
  }

  /** Throws when adding `adding` more of something would go over the plan limit. */
  async assertLimit(organizationId: string, key: LimitKey, adding = 1) {
    const sub = await this.subscriptionFor(organizationId);
    if (!sub) return;
    const max = sub.plan[LIMIT_FIELD[key]];
    if (max === null) return;
    const used = (await this.usage(organizationId))[key];
    if (used + adding > max) {
      throw new ForbiddenException({
        code: "PLAN_LIMIT",
        message: `Your ${sub.plan.name} plan allows ${max} ${key}. Upgrade your plan to add more.`,
        limit: key,
        max,
      });
    }
  }

  /** Throws when a total (e.g. warehouses set up in onboarding) is over the plan limit. */
  async assertTotal(organizationId: string, key: LimitKey, total: number) {
    const sub = await this.subscriptionFor(organizationId);
    const max = sub?.plan[LIMIT_FIELD[key]];
    if (!sub || max === null || max === undefined || total <= max) return;
    throw new ForbiddenException({ code: "PLAN_LIMIT", message: `Your ${sub.plan.name} plan allows ${max} ${key}.`, limit: key, max });
  }

  /** Keeps only the modules the plan includes. */
  async filterModules<T extends string>(organizationId: string, modules: T[]): Promise<T[]> {
    const allowed = await this.allowedModules(organizationId);
    return allowed ? modules.filter((m) => m === "inventory" || allowed.includes(m)) : modules;
  }

  /** Modules the plan allows (all when SaaS mode is off). */
  async allowedModules(organizationId: string): Promise<string[] | null> {
    const sub = await this.subscriptionFor(organizationId);
    return sub ? sub.plan.modules : null;
  }

  async overview(organizationId: string): Promise<BillingOverview> {
    const e = env();
    if (!this.enabled)
      return {
        enabled: false,
        subscription: null,
        usage: { users: 0, warehouses: 0, products: 0 },
        plans: [],
        invoices: [],
        payhere: false,
        bankDetails: null,
      };
    const [sub, usage, plans, invoices] = await Promise.all([
      this.subscriptionFor(organizationId),
      this.usage(organizationId),
      this.prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
      this.prisma.platformInvoice.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { plan: { select: { code: true, name: true } } },
      }),
    ]);
    return {
      enabled: true,
      subscription: sub && {
        status: sub.status,
        interval: sub.interval,
        trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
        plan: planSummary(sub.plan),
        state: subscriptionState(sub),
      },
      usage,
      plans: plans.map(planSummary),
      invoices: invoices.map((i) => ({
        id: i.id,
        number: i.number,
        amount: i.amount.toFixed(2),
        currency: i.currency,
        status: i.status,
        method: i.method,
        interval: i.interval,
        reference: i.reference,
        periodStart: i.periodStart?.toISOString() ?? null,
        periodEnd: i.periodEnd?.toISOString() ?? null,
        paidAt: i.paidAt?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
        plan: i.plan,
      })),
      payhere: this.payhereEnabled,
      bankDetails: e.BANK_TRANSFER_DETAILS ?? null,
    };
  }

  private async purchasablePlan(code: string) {
    const plan = await this.prisma.plan.findUnique({ where: { code } });
    if (!plan || !plan.active) throw new BadRequestException({ code: "PLAN_INVALID", message: "This plan is not available" });
    return plan;
  }

  private async createInvoice(ctx: RequestContext, plan: Plan, interval: BillingInterval, method: "payhere" | "bank_transfer", reference: string | null) {
    const orgId = ctx.user.organizationId;
    // Usage must fit the plan being bought (e.g. downgrading with too many users).
    const usage = await this.usage(orgId);
    for (const key of Object.keys(LIMIT_FIELD) as LimitKey[]) {
      const max = plan[LIMIT_FIELD[key]];
      if (max !== null && usage[key] > max) {
        throw new ConflictException({
          code: "PLAN_TOO_SMALL",
          message: `You have ${usage[key]} ${key}; the ${plan.name} plan allows ${max}.`,
          limit: key,
          max,
        });
      }
    }
    const [{ n }] = await this.prisma.$queryRaw<{ n: bigint }[]>`SELECT nextval('platform_invoice_seq') AS n`;
    const invoice = await this.prisma.platformInvoice.create({
      data: {
        organizationId: orgId,
        number: `SF-${new Date().getUTCFullYear()}-${String(n).padStart(5, "0")}`,
        planId: plan.id,
        interval,
        amount: interval === "year" ? plan.priceYearly : plan.priceMonthly,
        currency: plan.currency,
        method,
        reference,
      },
    });
    await this.audit.record({
      organizationId: orgId,
      userId: ctx.user.id,
      action: `billing.${method}`,
      entity: "PlatformInvoice",
      entityId: invoice.id,
      after: { plan: plan.code, interval, amount: invoice.amount.toString() },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return invoice;
  }

  /** Creates a pending invoice and the signed PayHere checkout form. */
  async checkout(ctx: RequestContext, input: CheckoutInput): Promise<PayHereCheckout> {
    if (!this.enabled || !this.payhereEnabled) throw new BadRequestException({ code: "PAYHERE_DISABLED", message: "Online payment is not available" });
    const e = env();
    const plan = await this.purchasablePlan(input.planCode);
    const invoice = await this.createInvoice(ctx, plan, input.interval, "payhere", null);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: ctx.user.organizationId } });
    const amount = invoice.amount.toFixed(2);
    const [first, ...rest] = ctx.user.name.split(" ");
    const web = e.WEB_URL.replace(/\/$/, "");
    const api = (e.API_PUBLIC_URL ?? e.WEB_URL).replace(/\/$/, "");
    return {
      action: e.PAYHERE_SANDBOX ? "https://sandbox.payhere.lk/pay/checkout" : "https://www.payhere.lk/pay/checkout",
      fields: {
        merchant_id: e.PAYHERE_MERCHANT_ID!,
        return_url: `${web}/settings/billing?paid=${invoice.number}`,
        cancel_url: `${web}/settings/billing?cancelled=${invoice.number}`,
        notify_url: `${api}/api/v1/billing/payhere/notify`,
        order_id: invoice.number,
        items: `StockFlow ${plan.name} (${input.interval === "year" ? "1 year" : "1 month"})`,
        currency: invoice.currency,
        amount,
        first_name: first || ctx.user.name,
        last_name: rest.join(" ") || "-",
        email: ctx.user.email,
        phone: org.phone ?? "0000000000",
        address: org.address ?? "-",
        city: org.city ?? "Colombo",
        country: "Sri Lanka",
        hash: md5(`${e.PAYHERE_MERCHANT_ID}${invoice.number}${amount}${invoice.currency}${md5(e.PAYHERE_MERCHANT_SECRET!)}`),
      },
    };
  }

  /** Server-to-server notification from PayHere. Returns true when the payment was applied. */
  async payhereNotify(body: Record<string, string>) {
    const e = env();
    if (!this.payhereEnabled) return false;
    const { merchant_id, order_id, payhere_amount, payhere_currency, status_code, md5sig, payment_id } = body;
    const expected = md5(`${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${md5(e.PAYHERE_MERCHANT_SECRET!)}`);
    if (!md5sig || merchant_id !== e.PAYHERE_MERCHANT_ID || md5sig.toUpperCase() !== expected) {
      throw new ForbiddenException({ code: "SIGNATURE_INVALID", message: "Invalid signature" });
    }
    const invoice = await this.prisma.platformInvoice.findUnique({ where: { number: order_id ?? "" } });
    if (!invoice) throw new NotFoundException();
    if (invoice.amount.toFixed(2) !== Number(payhere_amount).toFixed(2) || invoice.currency !== payhere_currency) {
      throw new BadRequestException({ code: "AMOUNT_MISMATCH", message: "Amount does not match the invoice" });
    }
    if (status_code === "2") {
      await this.markPaid(invoice.id, { gatewayPaymentId: payment_id ?? null });
      return true;
    }
    if (["-1", "-2", "-3"].includes(status_code ?? "") && invoice.status === "pending") {
      await this.prisma.platformInvoice.update({ where: { id: invoice.id }, data: { status: status_code === "-1" ? "cancelled" : "failed" } });
    }
    return false;
  }

  /** Tenant reports a bank transfer; the platform admin confirms it later. */
  async bankTransfer(ctx: RequestContext, input: BankTransferInput) {
    if (!this.enabled) throw new BadRequestException({ code: "BILLING_DISABLED", message: "Billing is not enabled" });
    const plan = await this.purchasablePlan(input.planCode);
    return this.createInvoice(ctx, plan, input.interval, "bank_transfer", input.reference);
  }

  async cancelPending(ctx: RequestContext, invoiceId: string) {
    const invoice = await this.prisma.platformInvoice.findFirst({ where: { id: invoiceId, organizationId: ctx.user.organizationId } });
    if (!invoice) throw new NotFoundException();
    if (invoice.status !== "pending") throw new ConflictException({ code: "INVOICE_NOT_PENDING", message: "Only pending payments can be cancelled" });
    await this.prisma.platformInvoice.update({ where: { id: invoice.id }, data: { status: "cancelled" } });
  }

  /**
   * Applies a payment: the invoice becomes paid and the subscription moves to its plan and is extended by one
   * interval from today or from the current period end, whichever is later. Idempotent for already-paid invoices.
   */
  async markPaid(invoiceId: string, opts: { gatewayPaymentId?: string | null; allowCancelled?: boolean; note?: string } = {}) {
    return this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM "PlatformInvoice" WHERE id = ${invoiceId}::uuid FOR UPDATE`;
      if (!locked) throw new NotFoundException();
      if (locked.status === "paid") return tx.platformInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
      if (locked.status === "cancelled" && !opts.allowCancelled)
        throw new ConflictException({ code: "INVOICE_CANCELLED", message: "This invoice was cancelled" });
      const invoice = await tx.platformInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
      const sub = await tx.subscription.findUnique({ where: { organizationId: invoice.organizationId } });
      const now = new Date();
      const base = sub?.status !== "trialing" && sub?.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
      const periodEnd = addInterval(base, invoice.interval);
      await tx.subscription.upsert({
        where: { organizationId: invoice.organizationId },
        create: { organizationId: invoice.organizationId, planId: invoice.planId, status: "active", interval: invoice.interval, currentPeriodEnd: periodEnd },
        update: { planId: invoice.planId, status: "active", interval: invoice.interval, currentPeriodEnd: periodEnd, trialEndsAt: null },
      });
      const paid = await tx.platformInvoice.update({
        where: { id: invoiceId },
        data: {
          status: "paid",
          paidAt: now,
          periodStart: base,
          periodEnd,
          gatewayPaymentId: opts.gatewayPaymentId ?? invoice.gatewayPaymentId,
          ...(opts.note ? { reference: [invoice.reference, opts.note].filter(Boolean).join(" · ") } : {}),
        },
      });
      await this.audit.record(
        {
          organizationId: invoice.organizationId,
          userId: null,
          action: "billing.paid",
          entity: "PlatformInvoice",
          entityId: invoiceId,
          after: { number: invoice.number, periodEnd },
        },
        tx,
      );
      return paid;
    });
  }
}
