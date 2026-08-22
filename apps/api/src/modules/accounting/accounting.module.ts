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
import { CollectionBatchController } from './collection-batch.controller';
import { CollectionBatchService } from './collection-batch.service';
import { CollectionDepositController } from './collection-deposit.controller';
import { CollectionDepositService } from './collection-deposit.service';
import { CollectionReconciliationController } from './collection-reconciliation.controller';
import { CollectionReconciliationService } from './collection-reconciliation.service';
import { CollectionTypeController } from './collection-type.controller';
import { CollectionTypeService } from './collection-type.service';
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
import { PayeeController } from './payee.controller';
import { PayeeService } from './payee.service';
import { PeriodController } from './period.controller';
import { PeriodService } from './period.service';
import { AccountingReportsController } from './reports.controller';
import { AccountingReportsService } from './reports.service';

@Module({
  controllers: [
    ChartOfAccountController,
    BankController,
    AccountMappingController,
    CollectionTypeController,
    CollectionBatchController,
    CollectionDepositController,
    CollectionReconciliationController,
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
    PayeeController,
  ],
  providers: [
    ChartOfAccountService,
    BankService,
    AccountMappingService,
    CollectionTypeService,
    CollectionBatchService,
    CollectionDepositService,
    CollectionReconciliationService,
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
    PayeeService,
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
