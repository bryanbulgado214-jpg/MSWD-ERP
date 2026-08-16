import { Module } from '@nestjs/common';

import { AccountMappingController } from './account-mapping.controller';
import { AccountMappingService } from './account-mapping.service';
import { AutoJevService } from './auto-jev.service';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { BankReconciliationService } from './bank-reconciliation.service';
import { BankController } from './bank.controller';
import { BankService } from './bank.service';
import { ChartOfAccountController } from './chart-of-account.controller';
import { ChartOfAccountService } from './chart-of-account.service';
import { CheckController } from './check.controller';
import { CheckService } from './check.service';
import { AccountingDashboardController } from './dashboard.controller';
import { AccountingDashboardService } from './dashboard.service';
import { DetailedStatementsService } from './detailed-statements.service';
import { DisbursementController } from './disbursement.controller';
import { DisbursementService } from './disbursement.service';
import { FinancialStatementsController } from './financial-statements.controller';
import { FinancialStatementsService } from './financial-statements.service';
import { GlController } from './gl.controller';
import { GlService } from './gl.service';
import { JevController } from './jev.controller';
import { JevService } from './jev.service';
import { LoanController } from './loan.controller';
import { LoanService } from './loan.service';
import { PeriodController } from './period.controller';
import { PeriodService } from './period.service';
import { AccountingReportsController } from './reports.controller';
import { AccountingReportsService } from './reports.service';

@Module({
  controllers: [
    ChartOfAccountController,
    BankController,
    AccountMappingController,
    JevController,
    GlController,
    CheckController,
    BankReconciliationController,
    PeriodController,
    FinancialStatementsController,
    AccountingDashboardController,
    DisbursementController,
    AccountingReportsController,
    LoanController,
  ],
  providers: [
    ChartOfAccountService,
    BankService,
    AccountMappingService,
    JevService,
    AutoJevService,
    GlService,
    CheckService,
    BankReconciliationService,
    PeriodService,
    FinancialStatementsService,
    DetailedStatementsService,
    AccountingDashboardService,
    DisbursementService,
    AccountingReportsService,
    LoanService,
  ],
  exports: [
    ChartOfAccountService,
    BankService,
    AccountMappingService,
    JevService,
    AutoJevService,
    GlService,
    CheckService,
    BankReconciliationService,
    PeriodService,
    FinancialStatementsService,
  ],
})
export class AccountingModule {}
