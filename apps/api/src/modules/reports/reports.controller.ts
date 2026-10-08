import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { PARTNER_TYPES } from "@stockflow/schemas";
import { z } from "zod";
import { Ctx, CurrentUser, RequirePermissions } from "../../common/decorators";
import type { RequestContext, RequestUser } from "../../common/request-user";
import { ZodPipe } from "../../common/zod.pipe";
import { assertCan } from "../commerce/common";
import { ImportService } from "./import.service";
import { ReportsService } from "./reports.service";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
const todayStr = () => new Date().toISOString().slice(0, 10);
const range = z.object({ from: date.default(monthStart), to: date.default(todayStr) });
const rowsSchema = z.object({ rows: z.array(z.record(z.unknown())).max(5000), dryRun: z.boolean().default(true) });

@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("sales")
  @RequirePermissions("reports.view")
  sales(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(range.extend({ groupBy: z.enum(["day", "month", "product", "customer"]).default("day") })))
    q: { from: string; to: string; groupBy: "day" | "month" | "product" | "customer" },
  ) {
    return this.reports.sales(user.organizationId, q, q.groupBy);
  }

  @Get("purchases")
  @RequirePermissions("reports.view")
  purchases(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(range.extend({ groupBy: z.enum(["month", "product", "supplier"]).default("supplier") })))
    q: { from: string; to: string; groupBy: "month" | "product" | "supplier" },
  ) {
    return this.reports.purchases(user.organizationId, q, q.groupBy);
  }

  @Get("margins")
  @RequirePermissions("reports.view")
  margins(@CurrentUser() user: RequestUser, @Query(new ZodPipe(range)) q: { from: string; to: string }) {
    return this.reports.margins(user.organizationId, q);
  }

  @Get("stock-valuation")
  @RequirePermissions("reports.view")
  valuation(@CurrentUser() user: RequestUser, @Query(new ZodPipe(z.object({ warehouseId: z.string().uuid().optional() }))) q: { warehouseId?: string }) {
    return this.reports.stockValuation(user.organizationId, q.warehouseId);
  }

  /** Dashboard chart data; visible to anyone who can see sales or reports. */
  @Get("trend")
  trend(@Ctx() ctx: RequestContext, @Query(new ZodPipe(z.object({ days: z.coerce.number().int().min(7).max(366).default(30) }))) q: { days: number }) {
    assertCan(ctx.user, "reports.view", "sales.view");
    return this.reports.trend(ctx.user.organizationId, q.days);
  }
}

@Controller("import")
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Post("products")
  @RequirePermissions("products.manage")
  products(@Ctx() ctx: RequestContext, @Body(new ZodPipe(rowsSchema)) body: z.infer<typeof rowsSchema>) {
    return this.imports.products(ctx, body.rows, body.dryRun);
  }

  @Post("partners")
  partners(
    @Ctx() ctx: RequestContext,
    @Body(new ZodPipe(rowsSchema.extend({ type: z.enum(PARTNER_TYPES) }))) body: z.infer<typeof rowsSchema> & { type: "customer" | "supplier" },
  ) {
    assertCan(ctx.user, body.type === "customer" ? "sales.manage" : "purchasing.manage");
    return this.imports.partners(ctx, body.type, body.rows, body.dryRun);
  }

  @Post("opening-stock")
  @RequirePermissions("inventory.stock_in")
  openingStock(
    @Ctx() ctx: RequestContext,
    @Body(new ZodPipe(rowsSchema.extend({ warehouseId: z.string().uuid() }))) body: z.infer<typeof rowsSchema> & { warehouseId: string },
  ) {
    return this.imports.openingStock(ctx, body.warehouseId, body.rows, body.dryRun);
  }
}
