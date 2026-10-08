import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller";
import { PartnersController } from "./partners.controller";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { StockController } from "./stock.controller";
import { StockLedgerService } from "./stock-ledger.service";
import { StockQueryService } from "./stock-query.service";
import { WarehousesController } from "./warehouses.controller";

@Module({
  controllers: [ProductsController, CatalogController, PartnersController, WarehousesController, StockController],
  providers: [ProductsService, StockLedgerService, StockQueryService],
  exports: [StockLedgerService, StockQueryService],
})
export class InventoryModule {}
