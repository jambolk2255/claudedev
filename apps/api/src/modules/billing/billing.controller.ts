import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { bankTransferSchema, checkoutSchema, type BankTransferInput, type CheckoutInput } from "@stockflow/schemas";
import type { FastifyRequest } from "fastify";
import { Ctx, CurrentUser, Public, RequirePermissions, SkipSubscription } from "../../common/decorators";
import type { RequestContext, RequestUser } from "../../common/request-user";
import { ZodPipe } from "../../common/zod.pipe";
import { BillingService } from "./billing.service";

@Controller("billing")
@SkipSubscription()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @RequirePermissions("organization.view")
  overview(@CurrentUser() user: RequestUser) {
    return this.billing.overview(user.organizationId);
  }

  /** Signed PayHere checkout form; the browser posts it to PayHere. */
  @Post("checkout")
  @RequirePermissions("organization.manage")
  checkout(@Ctx() ctx: RequestContext, @Body(new ZodPipe(checkoutSchema)) body: CheckoutInput) {
    return this.billing.checkout(ctx, body);
  }

  @Post("bank-transfer")
  @RequirePermissions("organization.manage")
  async bankTransfer(@Ctx() ctx: RequestContext, @Body(new ZodPipe(bankTransferSchema)) body: BankTransferInput) {
    const invoice = await this.billing.bankTransfer(ctx, body);
    return { id: invoice.id, number: invoice.number };
  }

  @Post("invoices/:id/cancel")
  @HttpCode(204)
  @RequirePermissions("organization.manage")
  cancel(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.billing.cancelPending(ctx, id);
  }

  /** PayHere server-to-server notification (form encoded, verified by md5sig). */
  @Post("payhere/notify")
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async notify(@Req() req: FastifyRequest) {
    const body = (req.body ?? {}) as Record<string, string>;
    await this.billing.payhereNotify(body);
    return { ok: true };
  }
}
