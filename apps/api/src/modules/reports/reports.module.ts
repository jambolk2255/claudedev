import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { ImportService } from "./import.service";
import { ImportController, ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({ imports: [InventoryModule], controllers: [ReportsController, ImportController], providers: [ReportsService, ImportService] })
export class ReportsModule {}
