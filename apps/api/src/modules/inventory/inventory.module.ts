import { Module } from '@nestjs/common';

import { AccountingModule } from '../accounting/accounting.module';

import { AccountabilityRecordController } from './accountability-record.controller';
import { AccountabilityRecordService } from './accountability-record.service';
import { DisposalRequestController } from './disposal-request.controller';
import { DisposalRequestService } from './disposal-request.service';
import { InventoryCostingService } from './inventory-costing.service';
import { InventoryGlController } from './inventory-gl.controller';
import { InventoryGlService } from './inventory-gl.service';
import { InventoryItemController } from './inventory-item.controller';
import { InventoryItemService } from './inventory-item.service';
import { InventoryReportsController } from './inventory-reports.controller';
import { InventoryReportsService } from './inventory-reports.service';
import { PhysicalCountController } from './physical-count.controller';
import { PhysicalCountService } from './physical-count.service';
import { PropertyRecordController } from './property-record.controller';
import { PropertyRecordService } from './property-record.service';
import { RisController } from './ris.controller';
import { RisService } from './ris.service';
import { StockReceiptController } from './stock-receipt.controller';
import { StockReceiptService } from './stock-receipt.service';
import { SupplyLedgerController } from './supply-ledger.controller';
import { SupplyLedgerService } from './supply-ledger.service';

@Module({
  imports: [AccountingModule],
  controllers: [
    InventoryItemController,
    StockReceiptController,
    RisController,
    PropertyRecordController,
    AccountabilityRecordController,
    PhysicalCountController,
    DisposalRequestController,
    InventoryReportsController,
    InventoryGlController,
    SupplyLedgerController,
  ],
  providers: [
    InventoryItemService,
    StockReceiptService,
    RisService,
    PropertyRecordService,
    AccountabilityRecordService,
    PhysicalCountService,
    DisposalRequestService,
    InventoryReportsService,
    InventoryCostingService,
    InventoryGlService,
    SupplyLedgerService,
  ],
})
export class InventoryModule {}
