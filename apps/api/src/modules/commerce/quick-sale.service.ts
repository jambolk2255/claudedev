import { BadRequestException, Injectable } from "@nestjs/common";
import type { QuickSaleInput } from "@stockflow/schemas";
import type { RequestContext } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import { D, assertCan } from "./common";
import { InvoicesService } from "./invoices.service";
import { PaymentsService } from "./payments.service";

const WALK_IN_CODE = "WALK-IN";

/** Counter sale: invoice + stock issue + receipt, all in one transaction. */
@Injectable()
export class QuickSaleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly payments: PaymentsService,
  ) {}

  private async walkInCustomer(orgId: string) {
    const db = this.prisma.tenant(orgId);
    const existing = await db.partner.findFirst({ where: { type: "customer", code: WALK_IN_CODE } });
    if (existing) return existing;
    return db.partner.create({ data: { organizationId: orgId, type: "customer", code: WALK_IN_CODE, name: "Walk-in customer" } });
  }

  async sell(ctx: RequestContext, input: QuickSaleInput) {
    assertCan(ctx.user, "sales.manage");
    assertCan(ctx.user, "sales.dispatch");
    const orgId = ctx.user.organizationId;
    const db = this.prisma.tenant(orgId);
    const partnerId = input.partnerId ?? (await this.walkInCustomer(orgId)).id;
    const products = new Map((await db.product.findMany({ where: { id: { in: input.lines.map((l) => l.productId) }, active: true } })).map((p) => [p.id, p]));
    const lines = input.lines.map((l) => {
      const p = products.get(l.productId);
      if (!p) throw new BadRequestException({ code: "PRODUCT_INVALID", message: "Product not found or inactive" });
      return {
        productId: p.id,
        description: null,
        quantity: l.quantity,
        unitPrice: l.unitPrice ?? Number(p.sellPrice),
        discountPct: l.discountPct,
        taxRateId: p.taxRateId,
        orderLineId: null,
      };
    });

    // Paid in full at the counter, so the credit limit can't be exceeded.
    return this.prisma.$transaction(
      async (tx) => {
        const invoiceId = await this.invoices.create(
          ctx,
          {
            kind: "sales",
            partnerId,
            orderId: null,
            supplierRef: null,
            notes: null,
            deliverFromWarehouseId: input.warehouseId,
            overrideCreditLimit: false,
            lines,
          },
          { tx, skipCreditCheck: true },
        );
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
        const total = D(invoice.total);
        if (input.payment.tendered !== undefined && D(input.payment.tendered).lt(total)) {
          throw new BadRequestException({ code: "UNDERPAID", message: `Amount tendered is less than the total (${total.toNumber()})` });
        }
        if (total.lte(0)) return { invoiceId, receiptId: null, number: invoice.number, total: 0, change: input.payment.tendered ?? 0 };
        const receiptId = await this.payments.create(
          ctx,
          {
            kind: "receipt",
            partnerId,
            method: input.payment.method,
            accountId: input.payment.accountId,
            amount: total.toNumber(),
            reference: input.payment.reference,
            chequeNo: input.payment.chequeNo,
            chequeDate: input.payment.chequeDate,
            notes: null,
            allocations: [{ invoiceId, amount: total.toNumber() }],
          },
          tx,
        );
        return {
          invoiceId,
          receiptId,
          number: invoice.number,
          total: total.toNumber(),
          change: input.payment.tendered !== undefined ? D(input.payment.tendered).sub(total).toNumber() : 0,
        };
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }
}
