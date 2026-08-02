import { Module } from '@nestjs/common';

import { AccountMappingController } from './account-mapping.controller';
import { AccountMappingService } from './account-mapping.service';
import { AutoJevService } from './auto-jev.service';
import { BankController } from './bank.controller';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { BankReconciliationService } from './bank-reconciliation.service';
import { BankService } from './bank.service';
import { ChartOfAccountController } from './chart-of-account.controller';
import { ChartOfAccountService } from './chart-of-account.service';
import { CheckController } from './check.controller';
import { CheckService } from './check.service';
import { FinancialStatementsController } from './financial-statements.controller';
import { FinancialStatementsService } from './financial-statements.service';
import { GlController } from './gl.controller';
import { GlService } from './gl.service';
import { JevController } from './jev.controller';
import { JevService } from './jev.service';
import { PeriodController } from './period.controller';
import { PeriodService } from './period.service';

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
