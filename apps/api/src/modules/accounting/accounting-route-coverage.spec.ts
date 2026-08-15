// Route-coverage guard test.
//
// PermissionsGuard now FAILS CLOSED: a guarded route with no @RequirePermissions
// (and no @AuthenticatedOnly) is denied at runtime. This test is the CI
// complement — it fails if any *mutating* route (@Post/@Put/@Patch/@Delete) in an
// accounting controller is missing a @RequirePermissions gate, so a forgotten
// decorator is caught here rather than surfacing as an unexpected 403.
import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';

import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';

import { AccountMappingController } from './account-mapping.controller';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { BankController } from './bank.controller';
import { ChartOfAccountController } from './chart-of-account.controller';
import { CheckController } from './check.controller';
import { DisbursementController } from './disbursement.controller';
import { JevController } from './jev.controller';
import { PeriodController } from './period.controller';

const ACCOUNTING_CONTROLLERS = [
  AccountMappingController,
  BankController,
  BankReconciliationController,
  ChartOfAccountController,
  CheckController,
  DisbursementController,
  JevController,
  PeriodController,
];

const MUTATING = new Set<number>([
  RequestMethod.POST,
  RequestMethod.PUT,
  RequestMethod.PATCH,
  RequestMethod.DELETE,
]);

describe('accounting controllers: every mutating route is permission-gated', () => {
  for (const Controller of ACCOUNTING_CONTROLLERS) {
    const proto = Controller.prototype as unknown as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const handler = proto[name] as object;
      const httpMethod = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
      if (httpMethod === undefined || !MUTATING.has(httpMethod)) continue;

      it(`${Controller.name}.${name} declares @RequirePermissions`, () => {
        const onHandler = Reflect.getMetadata(PERMISSIONS_KEY, handler) as string[] | undefined;
        const onClass = Reflect.getMetadata(PERMISSIONS_KEY, Controller) as string[] | undefined;
        const perms = onHandler ?? onClass;
        expect(Array.isArray(perms)).toBe(true);
        expect((perms ?? []).length).toBeGreaterThan(0);
      });
    }
  }
});
