// prisma/seed-budgeting-scenarios.ts — REALISTIC DEMO/TEST SCENARIOS.
//
// Not production seed data (see prisma/seed.ts for that) and not the
// minimal smoke-test data from seed-budgeting-dev.ts — this is a
// deliberately richer, self-contained scenario set built specifically to
// demonstrate every stage of the Budgeting workflow with real, connected
// data: one annual budget cycle, three departments sharing the same
// fund source, releases, and a full spread of reservation outcomes
// (approved, rejected, cancelled-from-draft, cancelled-from-approved,
// and one release deliberately exhausted to demonstrate what "no budget
// left" looks like).
//
// Requires prisma/seed.ts to have already been run (needs the MSWD
// organization, FY{current year} fiscal year, and roles/permissions to
// exist) and prisma/seed-budgeting-dev.ts is NOT a prerequisite — this
// script creates its own departments, fund source, cycle, and version
// so it can be read start-to-finish as one coherent story, without
// depending on what state that other script happened to leave behind.
//
// Run via: npx ts-node prisma/seed-budgeting-scenarios.ts
// Safe to run more than once — every step uses upsert/idempotent lookups.

// Explicit env loading — see prisma/seed.ts's comment on why this is
// needed rather than relying on PrismaClient's own implicit detection.
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** Sets app.current_user_id for the current transaction only — mirrors
 * apps/api/src/modules/budgeting/audit-actor.util.ts's setAuditActor(),
 * so every row this script creates gets a correctly-attributed
 * audit_logs entry, exactly like it would through the real API. */
async function withActor<T>(
  actorUserId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_id', '${actorUserId}', true)`);
    return work(tx);
  });
}

async function main() {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { code: 'MSWD' } });
  const fiscalYear = await prisma.fiscalYear.findFirstOrThrow({
    where: { organizationId: organization.id },
    orderBy: { year: 'desc' },
  });
  const adminUser = await prisma.user.findFirstOrThrow({
    where: { organizationId: organization.id, username: 'admin' },
  });
  const budgetOfficerRole = await prisma.role.findFirstOrThrow({
    where: { organizationId: organization.id, code: 'BUDGET_OFFICER' },
  });
  const rootUnit = await prisma.organizationalUnit.findFirstOrThrow({
    where: { organizationId: organization.id, code: 'ROOT' },
  });

  // ── Three named department representatives (not just "admin" doing
  // everything) — makes the audit history actually show who did what. ──
  const userDefs = [
    { username: 'msantos', email: 'msantos@mswd.example.invalid', deptCode: 'ADMIN-DIV-SCEN', deptName: 'Administrative Division' },
    { username: 'rcruz', email: 'rcruz@mswd.example.invalid', deptCode: 'FINANCE-DIV-SCEN', deptName: 'Finance Division' },
    { username: 'egarcia', email: 'egarcia@mswd.example.invalid', deptCode: 'ENGINEERING-DIV-SCEN', deptName: 'Engineering Division' },
  ];

  const passwordHash = await bcrypt.hash('ScenarioDemo!2026', 12);
  const users: Record<string, { id: string }> = {};
  const responsibilityCenters: Record<string, { id: string }> = {};

  for (const def of userDefs) {
    const unit = await prisma.organizationalUnit.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: def.deptCode } },
      update: {},
      create: { organizationId: organization.id, code: def.deptCode, name: def.deptName, unitType: 'department' },
    });
    await prisma.department.upsert({
      where: { organizationalUnitId: unit.id },
      update: {},
      create: { organizationId: organization.id, organizationalUnitId: unit.id, code: def.deptCode, name: def.deptName },
    });
    responsibilityCenters[def.deptCode] = await prisma.responsibilityCenter.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: def.deptCode } },
      update: {},
      create: { organizationId: organization.id, organizationalUnitId: unit.id, code: def.deptCode, name: def.deptName },
    });

    const user = await prisma.user.upsert({
      where: { organizationId_username: { organizationId: organization.id, username: def.username } },
      update: {},
      create: { organizationId: organization.id, username: def.username, email: def.email, passwordHash },
    });
    users[def.username] = user;
    await prisma.userRole.upsert({
      where: { userId_roleId_organizationalUnitId: { userId: user.id, roleId: budgetOfficerRole.id, organizationalUnitId: rootUnit.id } },
      update: {},
      create: { userId: user.id, roleId: budgetOfficerRole.id, organizationalUnitId: rootUnit.id },
    });
  }

  const fundSource = await prisma.fundSource.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: 'GF-SCEN' } },
    update: {},
    create: { organizationId: organization.id, code: 'GF-SCEN', name: 'General Fund' },
  });

  // ── 1. ANNUAL BUDGET PREPARATION: one cycle, one approved version ──
  const cycle = await withActor(adminUser.id, (tx: Prisma.TransactionClient) =>
    tx.budgetCycle.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: 'FY-SCEN-CYCLE' } },
      update: {},
      create: {
        organizationId: organization.id,
        fiscalYearId: fiscalYear.id,
        code: 'FY-SCEN-CYCLE',
        name: `FY${fiscalYear.year} Annual Budget (Scenarios)`,
        status: 'active',
        createdBy: adminUser.id,
      },
    }),
  );

  const version = await withActor(adminUser.id, (tx: Prisma.TransactionClient) =>
    tx.budgetVersion.upsert({
      where: { budgetCycleId_versionNumber: { budgetCycleId: cycle.id, versionNumber: 1 } },
      update: {},
      create: {
        budgetCycleId: cycle.id,
        versionNumber: 1,
        name: 'Original',
        status: 'approved',
        isCurrent: true,
        createdBy: adminUser.id,
      },
    }),
  );

  // Three departments, each with an approved budget against the SAME
  // fund source — demonstrates "multiple departments requesting the
  // same fund" (General Fund) throughout everything that follows.
  const headerDefs = [
    {
      deptCode: 'ADMIN-DIV-SCEN', creator: 'msantos', total: 300_000,
      lines: [['5-01-01-000', 'Personnel Services', 200_000], ['5-02-01-000', 'MOOE', 100_000]],
    },
    {
      deptCode: 'FINANCE-DIV-SCEN', creator: 'rcruz', total: 500_000,
      lines: [['5-01-01-000', 'Personnel Services', 350_000], ['5-02-01-000', 'MOOE', 150_000]],
    },
    {
      deptCode: 'ENGINEERING-DIV-SCEN', creator: 'egarcia', total: 400_000,
      lines: [['5-01-01-000', 'Personnel Services', 250_000], ['5-02-01-000', 'MOOE', 100_000], ['5-03-01-000', 'Capital Outlay', 50_000]],
    },
  ] as const;

  const headers: Record<string, { id: string }> = {};
  for (const def of headerDefs) {
    const creatorId = users[def.creator].id;
    const header = await withActor(creatorId, (tx: Prisma.TransactionClient) =>
      tx.budgetHeader.upsert({
        where: {
          budgetVersionId_responsibilityCenterId_fundSourceId: {
            budgetVersionId: version.id,
            responsibilityCenterId: responsibilityCenters[def.deptCode].id,
            fundSourceId: fundSource.id,
          },
        },
        update: {},
        create: {
          organizationId: organization.id,
          budgetVersionId: version.id,
          responsibilityCenterId: responsibilityCenters[def.deptCode].id,
          fundSourceId: fundSource.id,
          totalAmount: def.total,
          status: 'approved',
          createdBy: creatorId,
        },
      }),
    );
    headers[def.deptCode] = header;

    for (const [accountCode, description, amount] of def.lines) {
      const existing = await prisma.budgetLine.findFirst({ where: { budgetHeaderId: header.id, accountCode } });
      if (!existing) {
        await withActor(creatorId, (tx: Prisma.TransactionClient) =>
          tx.budgetLine.create({
            data: { budgetHeaderId: header.id, accountCode, description, amount, createdBy: creatorId },
          }),
        );
      }
    }
  }

  // ── 2. BUDGET RELEASE: a Q1 release against each department's header ──
  const releaseDefs = [
    { deptCode: 'ADMIN-DIV-SCEN', creator: 'msantos', amount: 75_000, number: 'REL-SCEN-ADMIN-Q1' },
    { deptCode: 'FINANCE-DIV-SCEN', creator: 'rcruz', amount: 125_000, number: 'REL-SCEN-FINANCE-Q1' },
    { deptCode: 'ENGINEERING-DIV-SCEN', creator: 'egarcia', amount: 100_000, number: 'REL-SCEN-ENGINEERING-Q1' },
  ] as const;

  const releases: Record<string, { id: string }> = {};
  for (const def of releaseDefs) {
    const creatorId = users[def.creator].id;
    releases[def.deptCode] = await withActor(creatorId, (tx: Prisma.TransactionClient) =>
      tx.budgetRelease.upsert({
        where: { organizationId_releaseNumber: { organizationId: organization.id, releaseNumber: def.number } },
        update: {},
        create: {
          organizationId: organization.id,
          budgetHeaderId: headers[def.deptCode].id,
          releaseNumber: def.number,
          releaseDate: new Date(`${fiscalYear.year}-01-15`),
          releasedAmount: def.amount,
          status: 'released',
          createdBy: creatorId,
        },
      }),
    );
  }

  /** Mirrors ReservationService's create-draft → submit → (approve |
   * reject | cancel) lifecycle exactly, including the ledger entries
   * and reserved_amount adjustments the real service makes — this is
   * seed data standing in for what would otherwise be six separate API
   * calls per reservation. */
  async function createAndAdvanceReservation(params: {
    releaseDeptCode: string;
    amount: number;
    subjectTable: string;
    requestedBy: string;
    outcome: 'stay_draft' | 'approved' | 'rejected' | 'cancelled_from_draft' | 'cancelled_from_approved';
    decidedBy?: string;
    remarks?: string;
  }) {
    const release = releases[params.releaseDeptCode];
    const requesterId = users[params.requestedBy].id;
    const decidedById = params.decidedBy ? users[params.decidedBy].id : requesterId;

    const reservation = await withActor(requesterId, (tx: Prisma.TransactionClient) =>
      tx.budgetReservation.create({
        data: {
          organizationId: organization.id,
          budgetReleaseId: release.id,
          subjectTable: params.subjectTable,
          reservationAmount: params.amount,
          status: 'draft',
          createdBy: requesterId,
        },
      }),
    );

    if (params.outcome === 'stay_draft') {
      return reservation; // deliberately left as-is — see "budget exhaustion" scenario below
    }

    if (params.outcome === 'cancelled_from_draft') {
      return withActor(requesterId, (tx: Prisma.TransactionClient) =>
        tx.budgetReservation.update({
          where: { id: reservation.id },
          data: { status: 'cancelled', updatedBy: requesterId, version: { increment: 1 } },
        }),
      );
    }

    // Every remaining outcome passes through "submitted" first, which is
    // the actual commitment stage — reserved_amount goes up here.
    await withActor(requesterId, async (tx: Prisma.TransactionClient) => {
      await tx.$executeRawUnsafe(
        `UPDATE budget_releases SET reserved_amount = reserved_amount + ${params.amount} WHERE id = '${release.id}'`,
      );
      await tx.budgetTransactionLog.create({
        data: {
          organizationId: organization.id,
          budgetReleaseId: release.id,
          budgetReservationId: reservation.id,
          transactionType: 'reservation',
          signedAmount: params.amount,
          createdBy: requesterId,
        },
      });
      await tx.budgetReservation.update({
        where: { id: reservation.id },
        data: { status: 'submitted', updatedBy: requesterId, version: { increment: 1 } },
      });
    });

    if (params.outcome === 'approved') {
      return withActor(decidedById, (tx: Prisma.TransactionClient) =>
        tx.budgetReservation.update({
          where: { id: reservation.id },
          data: { status: 'approved', updatedBy: decidedById, version: { increment: 1 } },
        }),
      );
    }

    if (params.outcome === 'rejected') {
      return withActor(decidedById, async (tx: Prisma.TransactionClient) => {
        await tx.$executeRawUnsafe(
          `UPDATE budget_releases SET reserved_amount = reserved_amount - ${params.amount} WHERE id = '${release.id}'`,
        );
        await tx.budgetTransactionLog.create({
          data: {
            organizationId: organization.id,
            budgetReleaseId: release.id,
            budgetReservationId: reservation.id,
            transactionType: 'reservation_cancellation',
            signedAmount: -params.amount,
            remarks: params.remarks,
            createdBy: decidedById,
          },
        });
        return tx.budgetReservation.update({
          where: { id: reservation.id },
          data: { status: 'rejected', updatedBy: decidedById, version: { increment: 1 } },
        });
      });
    }

    // cancelled_from_approved: approve first, then cancel (releasing the hold).
    await withActor(decidedById, (tx: Prisma.TransactionClient) =>
      tx.budgetReservation.update({
        where: { id: reservation.id },
        data: { status: 'approved', updatedBy: decidedById, version: { increment: 1 } },
      }),
    );
    return withActor(requesterId, async (tx: Prisma.TransactionClient) => {
      await tx.$executeRawUnsafe(
        `UPDATE budget_releases SET reserved_amount = reserved_amount - ${params.amount} WHERE id = '${release.id}'`,
      );
      await tx.budgetTransactionLog.create({
        data: {
          organizationId: organization.id,
          budgetReleaseId: release.id,
          budgetReservationId: reservation.id,
          transactionType: 'reservation_cancellation',
          signedAmount: -params.amount,
          remarks: params.remarks,
          createdBy: requesterId,
        },
      });
      return tx.budgetReservation.update({
        where: { id: reservation.id },
        data: { status: 'cancelled', updatedBy: requesterId, version: { increment: 1 } },
      });
    });
  }

  // ── 3–7. Reservation requests covering every outcome ──

  // Admin Division (release: 75,000 available)
  await createAndAdvanceReservation({
    releaseDeptCode: 'ADMIN-DIV-SCEN', amount: 20_000, subjectTable: 'procurement.purchase_requests',
    requestedBy: 'msantos', outcome: 'approved', decidedBy: 'admin',
  }); // → reserved 20,000, available 55,000
  await createAndAdvanceReservation({
    releaseDeptCode: 'ADMIN-DIV-SCEN', amount: 15_000, subjectTable: 'hr.events',
    requestedBy: 'msantos', outcome: 'cancelled_from_draft',
  }); // team-building event, changed mind before submitting — no budget impact

  // Finance Division (release: 125,000 available)
  await createAndAdvanceReservation({
    releaseDeptCode: 'FINANCE-DIV-SCEN', amount: 40_000, subjectTable: 'procurement.purchase_requests',
    requestedBy: 'rcruz', outcome: 'approved', decidedBy: 'admin',
  }); // external audit services
  await createAndAdvanceReservation({
    releaseDeptCode: 'FINANCE-DIV-SCEN', amount: 30_000, subjectTable: 'procurement.purchase_requests',
    requestedBy: 'rcruz', outcome: 'rejected', decidedBy: 'admin',
    remarks: 'Needs additional vendor quotes before approval.',
  }); // software license renewal — rejected, hold released back
  await createAndAdvanceReservation({
    releaseDeptCode: 'FINANCE-DIV-SCEN', amount: 50_000, subjectTable: 'procurement.contracts',
    requestedBy: 'rcruz', outcome: 'cancelled_from_approved',
    remarks: 'Project postponed to Q2.',
  }); // consulting fees — approved, then cancelled; hold released back
  // → net reserved 40,000, available 85,000

  // Engineering Division (release: 100,000 available) — BUDGET EXHAUSTION
  await createAndAdvanceReservation({
    releaseDeptCode: 'ENGINEERING-DIV-SCEN', amount: 60_000, subjectTable: 'procurement.purchase_requests',
    requestedBy: 'egarcia', outcome: 'approved', decidedBy: 'admin',
  }); // heavy equipment rental
  await createAndAdvanceReservation({
    releaseDeptCode: 'ENGINEERING-DIV-SCEN', amount: 40_000, subjectTable: 'procurement.purchase_requests',
    requestedBy: 'egarcia', outcome: 'approved', decidedBy: 'admin',
  }); // vehicle maintenance
  // → reserved 100,000, available 0 — release is now FULLY EXHAUSTED
  await createAndAdvanceReservation({
    releaseDeptCode: 'ENGINEERING-DIV-SCEN', amount: 15_000, subjectTable: 'procurement.purchase_requests',
    requestedBy: 'egarcia', outcome: 'stay_draft',
  }); // emergency generator purchase — intentionally left in "draft":
  // available_amount on this release is now 0, so submitting this
  // reservation would correctly fail BudgetValidation's
  // assertWithinAvailableBudget check ("Insufficient budget: available
  // 0.00, requested 15000.00"). Demonstrates budget exhaustion without
  // needing to actually call the (correctly failing) API.

  console.log('Budgeting scenario data complete:');
  console.log(`  Cycle: ${cycle.name}`);
  console.log(`  Departments: Admin, Finance, Engineering — all against ${fundSource.name}`);
  console.log('  Admin release: 75,000 released, 20,000 reserved (1 approved, 1 cancelled-from-draft)');
  console.log('  Finance release: 125,000 released, 40,000 reserved (1 approved, 1 rejected, 1 cancelled-from-approved)');
  console.log('  Engineering release: 100,000 released, 100,000 reserved — FULLY EXHAUSTED (2 approved, 1 stuck in draft, unsubmittable)');
  console.log('  Audit history: every row above trigger-logged to audit_logs, attributed to msantos/rcruz/egarcia/admin individually');
}

main()
  .catch((err) => {
    console.error('Scenario seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
