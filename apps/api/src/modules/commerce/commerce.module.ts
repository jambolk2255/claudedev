import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { InvoicesController, OrdersController, PaymentsController, ReturnsController, TrackingController } from "./commerce.controller";
import { InvoicesService } from "./invoices.service";
import { OrdersService } from "./orders.service";
import { PaymentsService } from "./payments.service";
import { QuickSaleService } from "./quick-sale.service";
import { ReturnsService } from "./returns.service";

@Module({
  imports: [InventoryModule],
  controllers: [OrdersController, InvoicesController, PaymentsController, ReturnsController, TrackingController],
  providers: [OrdersService, InvoicesService, PaymentsService, ReturnsService, QuickSaleService],
  exports: [InvoicesService, PaymentsService],
})
export class CommerceModule {}
