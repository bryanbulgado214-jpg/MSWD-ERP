import { Module } from '@nestjs/common';

import { BudgetingModule } from '../budgeting/budgeting.module';
import { NotificationModule } from '../notification/notification.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { AuditTrailController } from './audit-trail.controller';
import { AppItemController } from './app-item.controller';
import { DelegationController } from './delegation.controller';
import { DelegationService } from './delegation.service';
import { AppItemService } from './app-item.service';
import { CafController } from './caf.controller';
import { CafService } from './caf.service';
import { OrsController } from './ors.controller';
import { OrsService } from './ors.service';
import { PpmpController } from './ppmp.controller';
import { PpmpService } from './ppmp.service';
import { ProcurementLookupController } from './procurement-lookup.controller';
import { PurchaseOrderController } from './purchase-order.controller';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseRequestService } from './purchase-request.service';
import { PurchaseRequestsController } from './purchase-requests.controller';
import { SupplierController } from './supplier.controller';
import { SupplierService } from './supplier.service';

@Module({
  imports: [BudgetingModule, WorkflowModule, NotificationModule],
  controllers: [
    PurchaseRequestsController,
    PpmpController,
    AppItemController,
    ProcurementLookupController,
    SupplierController,
    PurchaseOrderController,
    CafController,
    OrsController,
    AuditTrailController,
    DelegationController,
  ],
  providers: [
    PurchaseRequestService, PpmpService, AppItemService,
    SupplierService, PurchaseOrderService, CafService, OrsService,
    DelegationService,
  ],
  exports: [
    PurchaseRequestService, PpmpService, AppItemService,
    SupplierService, PurchaseOrderService, CafService, OrsService,
    DelegationService,
  ],
})
export class ProcurementModule {}
