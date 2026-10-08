import { Global, Module } from "@nestjs/common";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { PlatformAdminGuard, PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";
import { SubscriptionGuard } from "./subscription.guard";

@Global()
@Module({
  controllers: [BillingController, PlatformController],
  providers: [BillingService, PlatformService, PlatformAdminGuard, SubscriptionGuard],
  exports: [BillingService, SubscriptionGuard],
})
export class BillingModule {}
