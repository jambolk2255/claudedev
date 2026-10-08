import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { FulfilmentInput, OrderInput, OrderKind, Paginated } from "@stockflow/schemas";
import { randomToken } from "../../common/crypto";
import type { RequestContext } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { nextNumber } from "../inventory/sequence";
import { StockLedgerService } from "../inventory/stock-ledger.service";
import { D, ORDER_PERMS, assertCan, assertPartner, auditMeta, customerBalance, priceLines, ssclRateFor, toDate } from "./common";

const SEQ = { purchase: "purchaseOrder", quotation: "quotation", sales: "salesOrder" } as const;

export interface OrderListQuery {
  kind: OrderKind;
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  partnerId?: string;
  overdue?: boolean;
}

const detailInclude = {
  partner: { select: { id: true, code: true, name: true, phone: true, email: true, creditLimit: true, paymentTermsDays: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  convertedFrom: { select: { id: true, number: true } },
  convertedTo: { select: { id: true, number: true } },
  lines: {
    orderBy: { lineNo: "asc" },
    include: { product: { select: { id: true, sku: true, name: true, trackBatches: true, type: true, unit: { select: { code: true } } } } },
  },
  stockDocuments: { orderBy: { createdAt: "asc" }, select: { id: true, number: true, type: true, documentDate: true, totalValue: true, createdAt: true } },
  invoices: {
    orderBy: { createdAt: "asc" },
    select: { id: true, number: true, kind: true, invoiceDate: true, total: true, amountPaid: true, status: true, createdAt: true },
  },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: StockLedgerService,
  ) {}

  async list(ctx: RequestContext, q: OrderListQuery): Promise<Paginated<unknown>> {
    assertCan(ctx.user, ORDER_PERMS[q.kind].view);
    const db = this.prisma.tenant(ctx.user.organizationId);
    const where: Prisma.OrderWhereInput = {
      kind: q.kind,
      ...(q.status ? { status: q.status as Prisma.EnumOrderStatusFilter["equals"] } : {}),
      ...(q.partnerId ? { partnerId: q.partnerId } : {}),
      ...(q.overdue ? { status: { in: ["confirmed", "partial"] }, expectedDate: { lt: new Date(new Date().toISOString().slice(0, 10)) } } : {}),
      ...(q.search
        ? {
            OR: [
              { number: { contains: q.search, mode: "insensitive" } },
              { reference: { contains: q.search, mode: "insensitive" } },
              { partner: { name: { contains: q.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { partner: { select: { id: true, name: true } }, warehouse: { select: { code: true } }, _count: { select: { lines: true } } },
      }),
      db.order.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async get(ctx: RequestContext, id: string) {
    const order = await this.prisma.tenant(ctx.user.organizationId).order.findUnique({ where: { id }, include: detailInclude });
    if (!order) throw new NotFoundException();
    assertCan(ctx.user, ORDER_PERMS[order.kind].view);
    return order;
  }

  private async buildLines(orgId: string, input: OrderInput) {
    const db = this.prisma.tenant(orgId);
    const productIds = [...new Set(input.lines.map((l) => l.productId))];
    const products = await db.product.findMany({ where: { id: { in: productIds }, active: true } });
    if (products.length !== productIds.length) throw new BadRequestException({ code: "PRODUCT_INVALID", message: "Product not found or inactive" });
    const ssclRate = input.kind === "purchase" ? 0 : await ssclRateFor(db);
    return priceLines(db, input.lines, ssclRate);
  }

  private async validateHeader(orgId: string, input: OrderInput) {
    const db = this.prisma.tenant(orgId);
    await assertPartner(db, input.partnerId, input.kind === "purchase" ? "supplier" : "customer");
    const wh = await db.warehouse.findFirst({ where: { id: input.warehouseId, active: true } });
    if (!wh) throw new BadRequestException({ code: "WAREHOUSE_INVALID", message: "Warehouse not found or inactive" });
  }

  private lineRows(priced: Awaited<ReturnType<OrdersService["buildLines"]>>["lines"]) {
    return priced.map((l, i) => ({
      lineNo: i + 1,
      productId: l.productId!,
      description: l.description ?? null,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct ?? 0,
      taxRateId: l.taxRateId ?? null,
      taxRate: l.taxRate,
      subtotal: l.amounts.subtotal,
      tax: l.amounts.tax + l.amounts.sscl,
      total: l.amounts.total,
    }));
  }

  async create(ctx: RequestContext, input: OrderInput) {
    assertCan(ctx.user, ORDER_PERMS[input.kind].manage);
    const orgId = ctx.user.organizationId;
    await this.validateHeader(orgId, input);
    const { lines, totals } = await this.buildLines(orgId, input);
    return this.prisma.$transaction(async (tx) => {
      const number = await nextNumber(tx, orgId, SEQ[input.kind]);
      const order = await tx.order.create({
        data: {
          organizationId: orgId,
          kind: input.kind,
          number,
          partnerId: input.partnerId,
          warehouseId: input.warehouseId,
          orderDate: toDate(input.orderDate),
          expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
          reference: input.reference,
          notes: input.notes,
          deliveryAddress: input.deliveryAddress,
          subtotal: totals.subtotal,
          discountTotal: totals.discount,
          taxTotal: totals.tax,
          ssclTotal: totals.sscl,
          total: totals.total,
          createdById: ctx.user.id,
          lines: { create: this.lineRows(lines) },
        },
      });
      await this.audit.record(
        { ...auditMeta(ctx), action: `order.${input.kind}.created`, entity: "Order", entityId: order.id, after: { number, total: totals.total } },
        tx,
      );
      return order;
    });
  }

  async update(ctx: RequestContext, id: string, input: OrderInput) {
    const orgId = ctx.user.organizationId;
    const existing = await this.prisma.tenant(orgId).order.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    assertCan(ctx.user, ORDER_PERMS[existing.kind].manage);
    if (existing.status !== "draft") throw new ConflictException({ code: "NOT_DRAFT", message: "Only draft orders can be edited" });
    if (input.kind !== existing.kind) throw new BadRequestException({ code: "KIND_CHANGE", message: "Order type can't change" });
    await this.validateHeader(orgId, input);
    const { lines, totals } = await this.buildLines(orgId, input);
    return this.prisma.$transaction(async (tx) => {
      await tx.orderLine.deleteMany({ where: { orderId: id } });
      const order = await tx.order.update({
        where: { id },
        data: {
          partnerId: input.partnerId,
          warehouseId: input.warehouseId,
          orderDate: toDate(input.orderDate),
          expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
          reference: input.reference,
          notes: input.notes,
          deliveryAddress: input.deliveryAddress,
          subtotal: totals.subtotal,
          discountTotal: totals.discount,
          taxTotal: totals.tax,
          ssclTotal: totals.sscl,
          total: totals.total,
          lines: { create: this.lineRows(lines) },
        },
      });
      await this.audit.record({ ...auditMeta(ctx), action: `order.${existing.kind}.updated`, entity: "Order", entityId: id }, tx);
      return order;
    });
  }

  /** Draft → confirmed. With the Approvals module on, only approvers can confirm. */
  async confirm(ctx: RequestContext, id: string, opts: { overrideCreditLimit?: boolean } = {}) {
    const orgId = ctx.user.organizationId;
    const db = this.prisma.tenant(orgId);
    const order = await db.order.findUnique({ where: { id }, include: { partner: true } });
    if (!order) throw new NotFoundException();
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { modules: true } });
    const perms = ORDER_PERMS[order.kind];
    assertCan(ctx.user, ...(org.modules.includes("approvals") ? [perms.approve] : [perms.manage, perms.approve]));
    if (order.status !== "draft") throw new ConflictException({ code: "NOT_DRAFT", message: "Only draft orders can be confirmed" });

    if (order.kind === "sales" && order.partner.creditLimit && !(opts.overrideCreditLimit && ctx.user.permissions.includes("sales.approve"))) {
      const balance = await customerBalance(db, order.partnerId);
      if (balance.add(order.total).gt(order.partner.creditLimit)) {
        throw new BadRequestException({
          code: "CREDIT_LIMIT",
          message: `${order.partner.name} would exceed the credit limit`,
          balance: balance.toNumber(),
          creditLimit: Number(order.partner.creditLimit),
        });
      }
    }

    const updated = await db.order.update({
      where: { id },
      data: { status: "confirmed", approvedById: ctx.user.id, approvedAt: new Date(), ...(order.kind === "sales" ? { trackingToken: randomToken(18) } : {}) },
    });
    await this.audit.record({ ...auditMeta(ctx), action: `order.${order.kind}.confirmed`, entity: "Order", entityId: id, after: { number: order.number } });
    return updated;
  }

  async cancel(ctx: RequestContext, id: string) {
    const db = this.prisma.tenant(ctx.user.organizationId);
    const order = await db.order.findUnique({ where: { id }, include: { lines: true } });
    if (!order) throw new NotFoundException();
    assertCan(ctx.user, ORDER_PERMS[order.kind].manage);
    if (!["draft", "confirmed"].includes(order.status) || order.lines.some((l) => D(l.fulfilledQty).gt(0) || D(l.invoicedQty).gt(0))) {
      throw new ConflictException({ code: "CANNOT_CANCEL", message: "Orders with receipts, deliveries or invoices can't be cancelled. Close them instead." });
    }
    const updated = await db.order.update({ where: { id }, data: { status: "cancelled" } });
    await this.audit.record({ ...auditMeta(ctx), action: `order.${order.kind}.cancelled`, entity: "Order", entityId: id });
    return updated;
  }

  /** Marks a partly fulfilled order as finished (the rest won't come). */
  async close(ctx: RequestContext, id: string) {
    const db = this.prisma.tenant(ctx.user.organizationId);
    const order = await db.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException();
    assertCan(ctx.user, ORDER_PERMS[order.kind].manage);
    if (!["confirmed", "partial", "fulfilled"].includes(order.status))
      throw new ConflictException({ code: "CANNOT_CLOSE", message: "Only open orders can be closed" });
    const updated = await db.order.update({ where: { id }, data: { status: "closed" } });
    await this.audit.record({ ...auditMeta(ctx), action: `order.${order.kind}.closed`, entity: "Order", entityId: id });
    return updated;
  }

  /** Quotation → new draft sales order with the same lines. */
  async convertQuotation(ctx: RequestContext, id: string) {
    assertCan(ctx.user, "sales.manage");
    const orgId = ctx.user.organizationId;
    const q = await this.prisma.tenant(orgId).order.findUnique({ where: { id }, include: { lines: true } });
    if (!q || q.kind !== "quotation") throw new NotFoundException();
    if (!["draft", "confirmed"].includes(q.status))
      throw new ConflictException({ code: "CANNOT_CONVERT", message: "This quotation was already converted or closed" });
    return this.prisma.$transaction(async (tx) => {
      const number = await nextNumber(tx, orgId, "salesOrder");
      const so = await tx.order.create({
        data: {
          organizationId: orgId,
          kind: "sales",
          number,
          partnerId: q.partnerId,
          warehouseId: q.warehouseId,
          orderDate: new Date(),
          expectedDate: q.expectedDate,
          reference: q.reference,
          notes: q.notes,
          deliveryAddress: q.deliveryAddress,
          subtotal: q.subtotal,
          discountTotal: q.discountTotal,
          taxTotal: q.taxTotal,
          ssclTotal: q.ssclTotal,
          total: q.total,
          convertedFromId: q.id,
          createdById: ctx.user.id,
          lines: {
            create: q.lines.map((l) => ({
              lineNo: l.lineNo,
              productId: l.productId,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discountPct: l.discountPct,
              taxRateId: l.taxRateId,
              taxRate: l.taxRate,
              subtotal: l.subtotal,
              tax: l.tax,
              total: l.total,
            })),
          },
        },
      });
      await tx.order.update({ where: { id: q.id }, data: { status: "closed" } });
      await this.audit.record({ ...auditMeta(ctx), action: "order.quotation.converted", entity: "Order", entityId: q.id, after: { salesOrder: number } }, tx);
      return so;
    });
  }

  /** Receive (purchase → GRN) or deliver (sales → delivery note) against open order lines. */
  async fulfil(ctx: RequestContext, id: string, input: FulfilmentInput) {
    const orgId = ctx.user.organizationId;
    const db = this.prisma.tenant(orgId);
    const order = await db.order.findUnique({ where: { id }, include: { lines: { include: { product: true } } } });
    if (!order || order.kind === "quotation") throw new NotFoundException();
    assertCan(ctx.user, ORDER_PERMS[order.kind].fulfil);
    if (!["confirmed", "partial"].includes(order.status))
      throw new ConflictException({ code: "ORDER_NOT_OPEN", message: "Confirm the order before receiving or delivering" });

    const byLine = new Map(order.lines.map((l) => [l.id, l]));
    for (const line of input.lines) {
      const ol = byLine.get(line.orderLineId);
      if (!ol) throw new BadRequestException({ code: "LINE_INVALID", message: "Order line not found" });
      if (ol.product.type !== "stock") throw new BadRequestException({ code: "PRODUCT_NOT_STOCKED", message: `${ol.product.sku} is a service` });
      const outstanding = D(ol.quantity).sub(ol.fulfilledQty);
      if (D(line.quantity).gt(outstanding)) {
        throw new BadRequestException({
          code: "OVER_FULFIL",
          message: `Only ${outstanding.toNumber()} of ${ol.product.sku} is outstanding`,
          orderLineId: ol.id,
          outstanding: outstanding.toNumber(),
        });
      }
    }

    const type = order.kind === "purchase" ? "grn" : "delivery";
    const prepared = await this.ledger.prepare(orgId, {
      type,
      warehouseId: order.warehouseId,
      partnerId: order.partnerId,
      orderId: order.id,
      reference: input.reference ?? order.reference,
      note: input.note,
      documentDate: input.documentDate,
      lines: input.lines.map((l) => {
        const ol = byLine.get(l.orderLineId)!;
        // Goods are received at the net purchase price (after discount, before VAT).
        const netUnit = D(ol.subtotal).div(ol.quantity).toDecimalPlaces(4).toNumber();
        return {
          productId: ol.productId,
          quantity: l.quantity,
          unitCost: type === "grn" ? netUnit : undefined,
          batchNo: l.batchNo,
          expiryDate: l.expiryDate,
          orderLineId: ol.id,
        };
      }),
    });

    const docId = await this.prisma.$transaction(
      async (tx) => {
        // Serialise fulfilments of the same order so outstanding quantities can't be exceeded concurrently.
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id}::uuid FOR UPDATE`;
        const fresh = await tx.orderLine.findMany({ where: { orderId: id } });
        const freshById = new Map(fresh.map((l) => [l.id, l]));
        for (const line of input.lines) {
          const ol = freshById.get(line.orderLineId)!;
          if (D(line.quantity).gt(D(ol.quantity).sub(ol.fulfilledQty)))
            throw new ConflictException({ code: "OVER_FULFIL", message: "This order was updated by someone else. Reload and try again." });
        }
        const result = await this.ledger.postInTx(tx, ctx, prepared);
        for (const line of input.lines) {
          await tx.orderLine.update({ where: { id: line.orderLineId }, data: { fulfilledQty: { increment: line.quantity } } });
        }
        const lines = await tx.orderLine.findMany({ where: { orderId: id }, include: { product: { select: { type: true } } } });
        const stockLines = lines.filter((l) => l.product.type === "stock");
        const done = stockLines.every((l) => D(l.fulfilledQty).gte(l.quantity));
        await tx.order.update({ where: { id }, data: { status: done ? "fulfilled" : "partial" } });
        return result.id;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
    return docId;
  }

  /** Public, minimal view for the shareable tracking link. */
  async track(token: string) {
    const order = await this.prisma.order.findUnique({
      where: { trackingToken: token },
      include: {
        organization: { select: { name: true, phone: true } },
        lines: { orderBy: { lineNo: "asc" }, select: { quantity: true, fulfilledQty: true, product: { select: { name: true } } } },
        stockDocuments: { where: { type: "delivery" }, orderBy: { createdAt: "asc" }, select: { number: true, documentDate: true } },
      },
    });
    if (!order || order.kind !== "sales") throw new NotFoundException({ code: "TRACKING_INVALID", message: "Tracking link not found" });
    return {
      number: order.number,
      status: order.status,
      orderDate: order.orderDate,
      expectedDate: order.expectedDate,
      company: order.organization.name,
      companyPhone: order.organization.phone,
      lines: order.lines.map((l) => ({ name: l.product.name, quantity: Number(l.quantity), delivered: Number(l.fulfilledQty) })),
      deliveries: order.stockDocuments,
    };
  }
}
