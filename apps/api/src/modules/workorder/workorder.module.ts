import { Module } from '@nestjs/common';

import { AccountingModule } from '../accounting/accounting.module';
import { NotificationModule } from '../notification/notification.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { WorkOrderCrewController } from './work-order-crew.controller';
import { WorkOrderCrewService } from './work-order-crew.service';
import { WorkOrderController } from './work-order.controller';
import { WorkOrderService } from './work-order.service';

@Module({
  imports: [AccountingModule, NotificationModule],
  controllers: [WorkOrderController, WorkOrderCrewController, StaffController],
  providers: [WorkOrderService, WorkOrderCrewService, StaffService],
  exports: [WorkOrderService],
})
export class WorkorderModule {}
