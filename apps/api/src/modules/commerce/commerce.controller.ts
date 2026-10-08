import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  INVOICE_KINDS,
  ORDER_KINDS,
  ORDER_STATUSES,
  PAYMENT_KINDS,
  allocateSchema,
  applyNoteSchema,
  fulfilmentInputSchema,
  invoiceInputSchema,
  orderInputSchema,
  paginationSchema,
  paymentInputSchema,
  quickSaleSchema,
  returnInputSchema,
  type FulfilmentInput,
  type InvoiceInput,
  type OrderInput,
  type PaymentInput,
  type QuickSaleInput,
  type ReturnInput,
} from "@stockflow/schemas";
import { z } from "zod";
import { Ctx, Public } from "../../common/decorators";
import type { RequestContext } from "../../common/request-user";
import { ZodPipe } from "../../common/zod.pipe";
import { StockQueryService } from "../inventory/stock-query.service";
import { InvoicesService } from "./invoices.service";
import { OrdersService } from "./orders.service";
import { PaymentsService } from "./payments.service";
import { QuickSaleService } from "./quick-sale.service";
import { ReturnsService } from "./returns.service";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");
const orderQuery = paginationSchema.extend({
  kind: z.enum(ORDER_KINDS),
  status: z.enum(ORDER_STATUSES).optional(),
  partnerId: z.string().uuid().optional(),
  overdue: bool.optional(),
});
const invoiceQuery = paginationSchema.extend({
  kind: z.enum(INVOICE_KINDS),
  status: z.enum(["open", "partially_paid", "paid", "void"]).optional(),
  partnerId: z.string().uuid().optional(),
  overdue: bool.optional(),
});
const paymentQuery = paginationSchema.extend({
  kind: z.enum(PAYMENT_KINDS).optional(),
  partnerId: z.string().uuid().optional(),
  method: z.enum(["cash", "bank_transfer", "cheque", "card"]).optional(),
  chequeStatus: z.enum(["pending", "cleared", "bounced"]).optional(),
});
const noteQuery = paginationSchema.extend({ kind: z.enum(["credit", "debit"]), partnerId: z.string().uuid().optional() });
const confirmSchema = z.object({ overrideCreditLimit: z.boolean().default(false) });

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly stock: StockQueryService,
  ) {}

  @Get()
  list(@Ctx() ctx: RequestContext, @Query(new ZodPipe(orderQuery)) q: z.infer<typeof orderQuery>) {
    return this.orders.list(ctx, q);
  }

  @Get(":id")
  get(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.orders.get(ctx, id);
  }

  @Post()
  create(@Ctx() ctx: RequestContext, @Body(new ZodPipe(orderInputSchema)) body: OrderInput) {
    return this.orders.create(ctx, body);
  }

  @Put(":id")
  update(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(orderInputSchema)) body: OrderInput) {
    return this.orders.update(ctx, id, body);
  }

  @Post(":id/confirm")
  @HttpCode(200)
  confirm(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(confirmSchema)) body: z.infer<typeof confirmSchema>) {
    return this.orders.confirm(ctx, id, body);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.orders.cancel(ctx, id);
  }

  @Post(":id/close")
  @HttpCode(200)
  close(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.orders.close(ctx, id);
  }

  @Post(":id/convert")
  convert(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.orders.convertQuotation(ctx, id);
  }

  /** GRN for purchase orders, delivery note for sales orders. */
  @Post(":id/fulfil")
  async fulfil(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(fulfilmentInputSchema)) body: FulfilmentInput) {
    const docId = await this.orders.fulfil(ctx, id, body);
    return this.stock.getDocument(ctx.user.organizationId, docId);
  }
}

@Controller("invoices")
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  list(@Ctx() ctx: RequestContext, @Query(new ZodPipe(invoiceQuery)) q: z.infer<typeof invoiceQuery>) {
    return this.invoices.list(ctx, q);
  }

  @Get(":id")
  get(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.invoices.get(ctx, id);
  }

  @Post()
  async create(@Ctx() ctx: RequestContext, @Body(new ZodPipe(invoiceInputSchema)) body: InvoiceInput) {
    const id = await this.invoices.create(ctx, body);
    return this.invoices.get(ctx, id);
  }
}

@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list(@Ctx() ctx: RequestContext, @Query(new ZodPipe(paymentQuery)) q: z.infer<typeof paymentQuery>) {
    return this.payments.list(ctx, q);
  }

  @Get(":id")
  get(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.payments.get(ctx, id);
  }

  @Post()
  async create(@Ctx() ctx: RequestContext, @Body(new ZodPipe(paymentInputSchema)) body: PaymentInput) {
    const id = await this.payments.create(ctx, body);
    return this.payments.get(ctx, id);
  }

  @Post(":id/allocate")
  @HttpCode(200)
  async allocate(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(allocateSchema)) body: z.infer<typeof allocateSchema>) {
    await this.payments.allocate(ctx, id, body.allocations);
    return this.payments.get(ctx, id);
  }

  @Post(":id/clear")
  @HttpCode(200)
  async clear(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.payments.clearCheque(ctx, id);
    return this.payments.get(ctx, id);
  }

  @Post(":id/bounce")
  @HttpCode(200)
  async bounce(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.payments.bounceCheque(ctx, id);
    return this.payments.get(ctx, id);
  }
}

@Controller()
export class ReturnsController {
  constructor(
    private readonly returns: ReturnsService,
    private readonly quickSale: QuickSaleService,
  ) {}

  @Post("returns")
  async create(@Ctx() ctx: RequestContext, @Body(new ZodPipe(returnInputSchema)) body: ReturnInput) {
    const id = await this.returns.create(ctx, body);
    return this.returns.getNote(ctx, id);
  }

  @Get("notes")
  list(@Ctx() ctx: RequestContext, @Query(new ZodPipe(noteQuery)) q: z.infer<typeof noteQuery>) {
    return this.returns.listNotes(ctx, q);
  }

  @Get("notes/:id")
  get(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.returns.getNote(ctx, id);
  }

  @Post("notes/:id/apply")
  @HttpCode(200)
  async apply(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(applyNoteSchema)) body: z.infer<typeof applyNoteSchema>) {
    await this.returns.apply(ctx, id, body.invoiceId, body.amount);
    return this.returns.getNote(ctx, id);
  }

  @Post("quick-sale")
  sell(@Ctx() ctx: RequestContext, @Body(new ZodPipe(quickSaleSchema)) body: QuickSaleInput) {
    return this.quickSale.sell(ctx, body);
  }
}

/** Public order tracking for customers (no authentication, minimal data). */
@Controller("track")
export class TrackingController {
  constructor(private readonly orders: OrdersService) {}

  @Get(":token")
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  track(@Param("token") token: string) {
    return this.orders.track(token);
  }
}
