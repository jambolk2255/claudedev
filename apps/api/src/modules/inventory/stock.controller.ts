import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { STOCK_DOCUMENT_TYPES, paginationSchema, stockDocumentInputSchema, type StockDocumentInput } from "@stockflow/schemas";
import { z } from "zod";
import { Ctx, CurrentUser, RequirePermissions } from "../../common/decorators";
import type { RequestContext, RequestUser } from "../../common/request-user";
import { ZodPipe } from "../../common/zod.pipe";
import { StockLedgerService } from "./stock-ledger.service";
import { StockQueryService } from "./stock-query.service";

const documentQuery = paginationSchema.extend({
  type: z.enum([...STOCK_DOCUMENT_TYPES, "grn", "delivery", "return_outward", "return_inward"]).optional(),
  status: z.enum(["posted", "in_transit", "received"]).optional(),
  warehouseId: z.string().uuid().optional(),
});
const movementQuery = paginationSchema.extend({
  productId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  type: z
    .enum([
      "opening",
      "stock_in",
      "stock_out",
      "adjustment_in",
      "adjustment_out",
      "transfer_out",
      "transfer_in",
      "purchase_in",
      "sale_out",
      "return_out",
      "return_in",
    ])
    .optional(),
});

@Controller("stock")
export class StockController {
  constructor(
    private readonly ledger: StockLedgerService,
    private readonly query: StockQueryService,
  ) {}

  @Get("summary")
  @RequirePermissions("inventory.view")
  summary(@CurrentUser() user: RequestUser) {
    return this.query.summary(user.organizationId);
  }

  @Get("alerts")
  @RequirePermissions("inventory.view")
  alerts(@CurrentUser() user: RequestUser) {
    return this.query.stockAlerts(user.organizationId);
  }

  @Get("documents")
  @RequirePermissions("inventory.view")
  documents(@CurrentUser() user: RequestUser, @Query(new ZodPipe(documentQuery)) q: z.infer<typeof documentQuery>) {
    return this.query.listDocuments(user.organizationId, q);
  }

  @Get("documents/:id")
  @RequirePermissions("inventory.view")
  document(@CurrentUser() user: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.query.getDocument(user.organizationId, id);
  }

  /** Creates and posts a document. The type-specific permission is checked by the ledger. */
  @Post("documents")
  async create(@Ctx() ctx: RequestContext, @Body(new ZodPipe(stockDocumentInputSchema)) body: StockDocumentInput) {
    const id = await this.ledger.post(ctx, body);
    return this.query.getDocument(ctx.user.organizationId, id);
  }

  @Post("documents/:id/receive")
  @HttpCode(200)
  async receive(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.ledger.receiveTransfer(ctx, id);
    return this.query.getDocument(ctx.user.organizationId, id);
  }

  @Get("movements")
  @RequirePermissions("inventory.view")
  movements(@CurrentUser() user: RequestUser, @Query(new ZodPipe(movementQuery)) q: z.infer<typeof movementQuery>) {
    return this.query.listMovements(user.organizationId, q);
  }
}
