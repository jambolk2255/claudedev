import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";

@Module({ imports: [InventoryModule], controllers: [FinanceController], providers: [FinanceService] })
export class FinanceModule {}
