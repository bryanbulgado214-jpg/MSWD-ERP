import { Module } from '@nestjs/common';

import { AccountingModule } from '../accounting/accounting.module';
import { CompensationController } from './compensation.controller';
import { CompensationService } from './compensation.service';
import { DtrController } from './dtr.controller';
import { DtrService } from './dtr.service';
import { EmployeeController } from './employee.controller';
import { EmployeeService } from './employee.service';
import { HrDashboardController } from './hr-dashboard.controller';
import { HrDashboardService } from './hr-dashboard.service';
import { HrLookupController } from './hr-lookup.controller';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { PositionController } from './position.controller';
import { PositionService } from './position.service';
import { HrReportsController } from './hr-reports.controller';
import { HrReportsService } from './hr-reports.service';
import { RemittanceController } from './remittance.controller';
import { RemittanceService } from './remittance.service';

@Module({
  imports: [AccountingModule],
  controllers: [
    EmployeeController,
    PositionController,
    HrLookupController,
    LeaveController,
    DtrController,
    CompensationController,
    PayrollController,
    RemittanceController,
    HrReportsController,
    HrDashboardController,
  ],
  providers: [
    EmployeeService,
    PositionService,
    LeaveService,
    DtrService,
    CompensationService,
    PayrollService,
    RemittanceService,
    HrReportsService,
    HrDashboardService,
  ],
  exports: [
    EmployeeService,
    PositionService,
    LeaveService,
    DtrService,
    CompensationService,
    PayrollService,
    RemittanceService,
    HrReportsService,
  ],
})
export class HrModule {}
