import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AllExceptionsFilter } from "./common/exception.filter";
import { JwtAuthGuard, PermissionsGuard } from "./common/guards";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BillingModule } from "./modules/billing/billing.module";
import { SubscriptionGuard } from "./modules/billing/subscription.guard";
import { CommerceModule } from "./modules/commerce/commerce.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { HealthController } from "./modules/health/health.controller";
import { ReportsModule } from "./modules/reports/reports.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { OnboardingModule } from "./modules/onboarding/onboarding.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { RolesModule } from "./modules/roles/roles.module";
import { UsersModule } from "./modules/users/users.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global default; sensitive auth routes use stricter @Throttle limits.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuditModule,
    BillingModule,
    AuthModule,
    UsersModule,
    RolesModule,
    OrganizationsModule,
    OnboardingModule,
    InventoryModule,
    CommerceModule,
    FinanceModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
  ],
})
export class AppModule {}
