import { Module } from '@nestjs/common';

import { AccountingModule } from '../accounting/accounting.module';
import { WorkOrderCrewController } from './work-order-crew.controller';
import { WorkOrderCrewService } from './work-order-crew.service';
import { WorkOrderController } from './work-order.controller';
import { WorkOrderService } from './work-order.service';

@Module({
  imports: [AccountingModule],
  controllers: [WorkOrderController, WorkOrderCrewController],
  providers: [WorkOrderService, WorkOrderCrewService],
  exports: [WorkOrderService],
})
export class WorkorderModule {}
