import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { DashboardController } from './dashboard.controller';
import { DatabaseModule } from './database/database.module';
import { ExecutiveDashboardService } from './executive-dashboard.service';
import { AccountingModule } from './modules/accounting/accounting.module';
import { AdminModule } from './modules/admin/admin.module';
import { AssetModule } from './modules/asset/asset.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { BudgetingModule } from './modules/budgeting/budgeting.module';
import { ComplaintModule } from './modules/complaint/complaint.module';
import { HrModule } from './modules/hr/hr.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { ReportsModule } from './modules/reports/reports.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { WorkorderModule } from './modules/workorder/workorder.module';
import { SearchController } from './search.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    AdminModule,
    AuthModule,
    BudgetingModule,
    WorkflowModule,
    NotificationModule,
    ProcurementModule,
    ReportsModule,
    InventoryModule,
    AccountingModule,
    BillingModule,
    HrModule,
    WorkorderModule,
    ComplaintModule,
    AssetModule,
  ],
  controllers: [AppController, DashboardController, SearchController],
  providers: [AppService, ExecutiveDashboardService],
})
export class AppModule {}
