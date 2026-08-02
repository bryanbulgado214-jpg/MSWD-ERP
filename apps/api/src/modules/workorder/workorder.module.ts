import { Module } from '@nestjs/common';

import { AccountingModule } from '../accounting/accounting.module';
import { WorkOrderController } from './work-order.controller';
import { WorkOrderService } from './work-order.service';

@Module({
  imports: [AccountingModule],
  controllers: [WorkOrderController],
  providers: [WorkOrderService],
  exports: [WorkOrderService],
})
export class WorkorderModule {}
