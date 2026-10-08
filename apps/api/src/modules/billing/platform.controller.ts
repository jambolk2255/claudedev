import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  PLATFORM_INVOICE_STATUSES,
  paginationSchema,
  planInputSchema,
  tenantSubscriptionSchema,
  type PlanInput,
  type TenantSubscriptionInput,
} from "@stockflow/schemas";
import { z } from "zod";
import { Ctx, SkipSubscription } from "../../common/decorators";
import type { AuthedRequest, RequestContext } from "../../common/request-user";
import { ZodPipe } from "../../common/zod.pipe";
import { BillingService } from "./billing.service";
import { PlatformService } from "./platform.service";

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly billing: BillingService) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (user && this.billing.isPlatformAdmin(user.email)) return true;
    throw new ForbiddenException({ code: "FORBIDDEN", message: "Platform administrators only" });
  }
}

const invoiceQuery = paginationSchema.extend({ status: z.enum(PLATFORM_INVOICE_STATUSES).optional() });
const noteSchema = z.object({ note: z.string().trim().max(200).optional() });

@Controller("platform")
@SkipSubscription()
@UseGuards(PlatformAdminGuard)
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get("summary")
  summary() {
    return this.platform.summary();
  }

  @Get("tenants")
  tenants(@Query(new ZodPipe(paginationSchema)) q: z.infer<typeof paginationSchema>) {
    return this.platform.tenants(q);
  }

  @Get("tenants/:id")
  tenant(@Param("id", ParseUUIDPipe) id: string) {
    return this.platform.tenant(id);
  }

  @Put("tenants/:id/subscription")
  setSubscription(
    @Ctx() ctx: RequestContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(tenantSubscriptionSchema)) body: TenantSubscriptionInput,
  ) {
    return this.platform.setSubscription(ctx, id, body);
  }

  @Get("invoices")
  invoices(@Query(new ZodPipe(invoiceQuery)) q: z.infer<typeof invoiceQuery>) {
    return this.platform.invoices(q);
  }

  @Post("invoices/:id/mark-paid")
  markPaid(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(noteSchema)) body: z.infer<typeof noteSchema>) {
    return this.platform.markPaid(ctx, id, body.note);
  }

  @Post("invoices/:id/cancel")
  cancel(@Param("id", ParseUUIDPipe) id: string) {
    return this.platform.cancelInvoice(id);
  }

  @Get("plans")
  plans() {
    return this.platform.plans();
  }

  @Put("plans/:code")
  updatePlan(@Param("code") code: string, @Body(new ZodPipe(planInputSchema)) body: PlanInput) {
    return this.platform.updatePlan(code, body);
  }
}
