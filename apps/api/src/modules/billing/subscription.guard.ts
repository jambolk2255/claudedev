import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SAFE_METHODS } from "../auth/cookies";
import { SKIP_SUBSCRIPTION } from "../../common/decorators";
import type { AuthedRequest } from "../../common/request-user";
import { BillingService } from "./billing.service";

/**
 * SaaS mode: an expired trial or unpaid subscription makes the company read-only (it can still view and
 * export its data and pay); a suspended company can only reach billing.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.billing.enabled) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION, [context.getHandler(), context.getClass()])) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) return true;
    const current = await this.billing.stateFor(req.user.organizationId, req.user.email);
    if (!current) return true;
    if (current.state.blocked)
      throw new ForbiddenException({ code: "ORG_SUSPENDED", message: "This account is suspended. Contact support or settle your subscription." });
    if (current.state.readOnly && !SAFE_METHODS.has(req.method)) {
      throw new HttpException(
        { code: "SUBSCRIPTION_INACTIVE", message: "Your subscription has ended. Renew it in Settings → Billing to make changes." },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}
