import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { subscriptionState, type PlanInput, type TenantSubscriptionInput } from "@stockflow/schemas";
import type { RequestContext } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { BillingService, planSummary } from "./billing.service";

const num = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

/** Operator console: every tenant, plan and subscription payment (not tenant-scoped). */
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  async summary() {
    const [orgs, subs, pending, paid30] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.subscription.findMany({ include: { plan: true } }),
      this.prisma.platformInvoice.aggregate({ where: { status: "pending" }, _count: true, _sum: { amount: true } }),
      this.prisma.platformInvoice.aggregate({
        where: { status: "paid", paidAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);
    const states = subs.map((s) => ({ s, state: subscriptionState(s) }));
    const byStatus: Record<string, number> = {};
    for (const { state } of states) byStatus[state.status] = (byStatus[state.status] ?? 0) + 1;
    // Monthly recurring revenue from active paid subscriptions (yearly plans spread over 12 months).
    const mrr = states
      .filter(({ s, state }) => s.status === "active" && state.status !== "expired")
      .reduce((sum, { s }) => sum + (s.interval === "year" ? Number(s.plan.priceYearly) / 12 : Number(s.plan.priceMonthly)), 0);
    return {
      tenants: orgs,
      byStatus,
      mrr: num(mrr),
      pendingPayments: { count: pending._count, amount: num(pending._sum.amount) },
      revenue30d: { count: paid30._count, amount: num(paid30._sum.amount) },
      trialsEndingSoon: states.filter(({ s, state }) => s.status === "trialing" && state.daysLeft !== null && state.daysLeft >= 0 && state.daysLeft <= 3)
        .length,
    };
  }

  async tenants(q: { search?: string; page: number; pageSize: number }) {
    const where: Prisma.OrganizationWhereInput = q.search
      ? { OR: [{ name: { contains: q.search, mode: "insensitive" } }, { users: { some: { email: { contains: q.search, mode: "insensitive" } } } }] }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          name: true,
          city: true,
          createdAt: true,
          onboardingCompletedAt: true,
          subscription: { include: { plan: { select: { code: true, name: true } } } },
          users: { where: { role: { key: "owner" } }, take: 1, select: { name: true, email: true, lastLoginAt: true } },
          _count: { select: { users: true, products: true, invoices: true } },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);
    return {
      items: items.map(({ subscription, users, ...o }) => ({
        ...o,
        owner: users[0] ?? null,
        subscription: subscription && { ...subscription, state: subscriptionState(subscription) },
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async tenant(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true } },
        users: {
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true, email: true, active: true, lastLoginAt: true, role: { select: { name: true } } },
        },
        platformInvoices: { orderBy: { createdAt: "desc" }, include: { plan: { select: { code: true, name: true } } } },
        _count: { select: { products: true, warehouses: true, invoices: true, orders: true } },
      },
    });
    if (!org) throw new NotFoundException();
    const usage = await this.billing.usage(id);
    return {
      id: org.id,
      name: org.name,
      email: org.email,
      phone: org.phone,
      city: org.city,
      createdAt: org.createdAt,
      modules: org.modules,
      counts: org._count,
      usage,
      users: org.users,
      subscription: org.subscription && { ...org.subscription, plan: planSummary(org.subscription.plan), state: subscriptionState(org.subscription) },
      invoices: org.platformInvoices,
    };
  }

  async setSubscription(ctx: RequestContext, organizationId: string, input: TenantSubscriptionInput) {
    const plan = await this.prisma.plan.findUnique({ where: { code: input.planCode } });
    if (!plan) throw new NotFoundException({ code: "PLAN_INVALID", message: "Plan not found" });
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!org) throw new NotFoundException();
    const end = new Date(`${input.periodEnd}T23:59:59.000Z`);
    const data = {
      planId: plan.id,
      status: input.status,
      interval: input.interval,
      trialEndsAt: input.status === "trialing" ? end : null,
      currentPeriodEnd: input.status === "trialing" ? null : end,
      note: input.reason ?? null,
    };
    const before = await this.prisma.subscription.findUnique({ where: { organizationId } });
    const sub = await this.prisma.subscription.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data });
    await this.audit.record({
      organizationId,
      userId: null,
      action: "billing.subscription_changed",
      entity: "Subscription",
      entityId: sub.id,
      before: before ? { status: before.status, planId: before.planId } : undefined,
      after: { by: ctx.user.email, plan: plan.code, status: input.status, periodEnd: input.periodEnd, reason: input.reason },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return sub;
  }

  async invoices(q: { status?: "pending" | "paid" | "cancelled" | "failed"; page: number; pageSize: number }) {
    const where: Prisma.PlatformInvoiceWhereInput = q.status ? { status: q.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.platformInvoice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { organization: { select: { id: true, name: true } }, plan: { select: { code: true, name: true } } },
      }),
      this.prisma.platformInvoice.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  markPaid(ctx: RequestContext, id: string, note?: string) {
    return this.billing.markPaid(id, { allowCancelled: true, note: note ? `${note} (${ctx.user.email})` : `confirmed by ${ctx.user.email}` });
  }

  async cancelInvoice(id: string) {
    const invoice = await this.prisma.platformInvoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException();
    if (invoice.status !== "pending") throw new ConflictException({ code: "INVOICE_NOT_PENDING", message: "Only pending payments can be cancelled" });
    return this.prisma.platformInvoice.update({ where: { id }, data: { status: "cancelled" } });
  }

  async plans() {
    const plans = await this.prisma.plan.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { subscriptions: true } } } });
    return plans.map((p) => ({ ...planSummary(p), subscribers: p._count.subscriptions }));
  }

  async updatePlan(code: string, input: PlanInput) {
    const plan = await this.prisma.plan.findUnique({ where: { code } });
    if (!plan) throw new NotFoundException();
    return planSummary(await this.prisma.plan.update({ where: { code }, data: input }));
  }
}
