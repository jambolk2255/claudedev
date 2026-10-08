import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";

@Module({ imports: [InventoryModule], controllers: [OnboardingController], providers: [OnboardingService] })
export class OnboardingModule {}
