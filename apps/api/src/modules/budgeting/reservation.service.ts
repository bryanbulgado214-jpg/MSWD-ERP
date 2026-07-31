import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type BudgetReservation, type BudgetReservationStatus, type BudgetReleaseStatus, type BudgetTransactionType } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from './audit-actor.util';
import { BudgetValidation } from './budget-validation';
import type { CreateReservationDraftInput, EditReservationDraftInput } from './reservation.types';

/**
 * Raw row shape returned by the row-locking SELECT below. Numeric
 * columns come back as strings from `$queryRaw` (the underlying driver
 * doesn't know to box them as Prisma.Decimal the way the generated
 * model client does) — they are explicitly converted to Prisma.Decimal
 * immediately after the query, never used as raw strings.
 */
interface LockedReleaseRow {
  id: string;
  status: BudgetReleaseStatus;
  reserved_amount: string;
  available_amount: string;
}

/**
 * Reservation Service — the full draft-to-terminal lifecycle for
 * budget_reservations: create draft, edit draft, submit, approve,
 * reject, cancel.
 *
 * Every public method takes the caller's `organizationId` and verifies
 * it against the reservation/release in question before doing anything
 * — a reservation belonging to a different organization is treated
 * exactly like one that doesn't exist (404), never revealed or acted
 * upon. This was previously missing (see docs/Modules/Budgeting-Phase1.md
 * review notes) and is the one behavior this cleanup pass changed:
 * requests already scoped to the correct organization work exactly as
 * before; only cross-organization requests, which should never have
 * succeeded, now correctly fail.
 *
 * `submit` is the one commitment-stage action in this lifecycle (per
 * docs/04_Database §12): it is the only method that takes a row lock on
 * the budget_release and actually commits the reservation's amount
 * against it. `createDraft`/`editDraft` intentionally do NOT touch the
 * release's balance at all — a draft may exist "over budget" on paper;
 * it simply cannot be submitted until there's room.
 *
 * KNOWN LIMITATION: this schema does not yet have a `budget_overrides`
 * table (that was part of an earlier architecture draft, not part of
 * what was actually built). `submit` therefore performs a HARD block
 * with no override path when available budget is insufficient — there
 * is currently no way to force a submission through. Add
 * `budget_overrides` + a workflow-approved override check here if/when
 * that becomes a requirement.
 */
@Injectable()
export class ReservationService {
  constructor(private readonly prisma: PrismaService) {}

  async createDraft(organizationId: string, input: CreateReservationDraftInput): Promise<BudgetReservation> {
    const amount = new Prisma.Decimal(input.reservationAmount);
    BudgetValidation.assertPositive(amount, 'reservationAmount');
    BudgetValidation.assertFixedPrecision(amount, 'reservationAmount');

    const release = await this.prisma.budgetRelease.findFirst({
      where: { id: input.budgetReleaseId, organizationId },
    });
    if (!release) {
      throw new NotFoundException(`Budget release ${input.budgetReleaseId} not found.`);
    }

    // "Allow users to create a reservation only from released budgets"
    // (Budget Reservation workflow task) — previously this check only
    // ran at submit() time (assertReleaseIsReleased), so a draft could
    // be created against a release that wasn't released yet (or was
    // cancelled) and would only fail later. Narrow, explicitly-
    // requested addition — reuses the exact same existing check
    // (BudgetValidation.assertReleaseIsReleased), just run earlier too.
    BudgetValidation.assertReleaseIsReleased(release.status);

    return runAudited(this.prisma, input.createdBy, (tx) =>
      tx.budgetReservation.create({
        data: {
          organizationId: release.organizationId,
          budgetReleaseId: input.budgetReleaseId,
          subjectTable: input.subjectTable ?? null,
          subjectId: input.subjectId ?? null,
          reservationAmount: amount,
          status: 'draft',
          createdBy: input.createdBy ?? null,
        },
      }),
    );
  }

  async editDraft(
    organizationId: string,
    reservationId: string,
    expectedVersion: number,
    input: EditReservationDraftInput,
  ): Promise<BudgetReservation> {
    const reservation = await this.requireReservation(organizationId, reservationId);
    this.assertStatus(reservation, ['draft'], 'edited');

    const data: Prisma.BudgetReservationUncheckedUpdateManyInput = { updatedBy: input.updatedBy ?? null };

    if (input.reservationAmount !== undefined) {
      const amount = new Prisma.Decimal(input.reservationAmount);
      BudgetValidation.assertPositive(amount, 'reservationAmount');
      BudgetValidation.assertFixedPrecision(amount, 'reservationAmount');
      data.reservationAmount = amount;
    }
    if (input.subjectTable !== undefined) data.subjectTable = input.subjectTable;
    if (input.subjectId !== undefined) data.subjectId = input.subjectId;

    return this.updateWithVersionCheck(reservationId, expectedVersion, data, input.updatedBy);
  }

  /**
   * The commitment-stage action. Locks TWO rows, in this order:
   *
   * 1. The reservation itself (`SELECT ... FOR UPDATE`) — re-verified as
   *    still `draft`, belonging to the caller's organization, and at the
   *    expected `version`, all under that lock. Locking the reservation
   *    row up front (rather than only checking version at the very end)
   *    closes a subtler race than the release-level one: two concurrent
   *    `submit()` calls for the SAME reservation ID fail fast here
   *    instead of one of them doing wasted work that then gets rolled
   *    back.
   * 2. The target budget_release — so a second, concurrent submit
   *    against the SAME release (a DIFFERENT reservation drawing on the
   *    same pool of money) cannot proceed on stale numbers; it blocks
   *    until this transaction commits or rolls back. This is the
   *    specific mechanism that prevents two users from overspending the
   *    same budget (docs/04_Database §12).
   */
  async submit(
    organizationId: string,
    reservationId: string,
    expectedVersion: number,
    actorUserId?: string,
  ): Promise<BudgetReservation> {
    return runAudited(this.prisma, actorUserId, async (tx) => {
      const reservationRows = await tx.$queryRaw<
        { id: string; organization_id: string; budget_release_id: string; reservation_amount: string; status: BudgetReservationStatus; version: number }[]
      >(Prisma.sql`
        SELECT id, organization_id, budget_release_id, reservation_amount, status, version
        FROM budget_reservations
        WHERE id = ${reservationId}::uuid AND organization_id = ${organizationId}::uuid
        FOR UPDATE
      `);
      const lockedReservation = reservationRows[0];
      if (!lockedReservation) {
        throw new NotFoundException(`Budget reservation ${reservationId} not found.`);
      }
      if (lockedReservation.version !== expectedVersion) {
        throw new ConflictException('Reservation was modified concurrently — reload and try again.');
      }
      this.assertStatus(lockedReservation, ['draft'], 'submitted');

      const reservationAmount = new Prisma.Decimal(lockedReservation.reservation_amount);

      const releaseRows = await tx.$queryRaw<LockedReleaseRow[]>(Prisma.sql`
        SELECT id, status, reserved_amount, available_amount
        FROM budget_releases
        WHERE id = ${lockedReservation.budget_release_id}::uuid
        FOR UPDATE
      `);
      const release = releaseRows[0];
      if (!release) {
        throw new NotFoundException(`Budget release ${lockedReservation.budget_release_id} not found.`);
      }

      // "Released budget required" — reserving against a release still
      // in draft (never formally released) or already cancelled is not
      // allowed.
      BudgetValidation.assertReleaseIsReleased(release.status);

      const availableAmount = new Prisma.Decimal(release.available_amount);
      const reservedAmount = new Prisma.Decimal(release.reserved_amount);

      // "Cannot reserve beyond available budget" — hard block, no
      // override path (see class doc comment).
      BudgetValidation.assertWithinAvailableBudget(availableAmount, reservationAmount);

      const newReservedAmount = reservedAmount.plus(reservationAmount);
      // "No negative balances" — defensive guard on the computed value
      // before it's written (see BudgetValidation's doc comment on why
      // this exists alongside the DB's own CHECK constraint).
      BudgetValidation.assertResultNotNegative(newReservedAmount, 'reserved_amount');

      await this.adjustReleaseBalance(tx, {
        releaseId: release.id,
        newReservedAmount,
        organizationId: lockedReservation.organization_id,
        budgetReservationId: lockedReservation.id,
        transactionType: 'reservation',
        signedAmount: reservationAmount,
        actorUserId,
        remarks: undefined,
      });

      return this.applyVersionedUpdate(
        tx,
        reservationId,
        expectedVersion,
        { status: 'submitted', updatedBy: actorUserId ?? null },
      );
    });
  }

  /**
   * Governance confirmation only — no budget re-check here. The amount
   * was already committed against the release at `submit` time.
   */
  async approve(
    organizationId: string,
    reservationId: string,
    expectedVersion: number,
    actorUserId?: string,
  ): Promise<BudgetReservation> {
    const reservation = await this.requireReservation(organizationId, reservationId);
    this.assertStatus(reservation, ['submitted'], 'approved');

    return this.updateWithVersionCheck(
      reservationId,
      expectedVersion,
      { status: 'approved', updatedBy: actorUserId ?? null },
      actorUserId,
    );
  }

  /** Releases the held amount back to the release's available balance. */
  async reject(
    organizationId: string,
    reservationId: string,
    expectedVersion: number,
    actorUserId?: string,
    remarks?: string,
  ): Promise<BudgetReservation> {
    const reservation = await this.requireReservation(organizationId, reservationId);
    this.assertStatus(reservation, ['submitted'], 'rejected');
    return this.releaseHoldAndSetStatus(reservation, expectedVersion, 'rejected', actorUserId, remarks);
  }

  /**
   * Cancellable from draft, submitted, or approved. A draft never held
   * any budget, so cancelling one is a plain status change with no
   * ledger entry; cancelling from submitted/approved releases the hold,
   * same as reject.
   */
  async cancel(
    organizationId: string,
    reservationId: string,
    expectedVersion: number,
    actorUserId?: string,
    remarks?: string,
  ): Promise<BudgetReservation> {
    const reservation = await this.requireReservation(organizationId, reservationId);
    this.assertStatus(reservation, ['draft', 'submitted', 'approved'], 'cancelled');

    if (reservation.status === 'draft') {
      return this.updateWithVersionCheck(
        reservationId,
        expectedVersion,
        { status: 'cancelled', updatedBy: actorUserId ?? null },
        actorUserId,
      );
    }

    return this.releaseHoldAndSetStatus(reservation, expectedVersion, 'cancelled', actorUserId, remarks);
  }

  // ── helpers ──

  private async releaseHoldAndSetStatus(
    reservation: BudgetReservation,
    expectedVersion: number,
    newStatus: 'rejected' | 'cancelled',
    actorUserId?: string,
    remarks?: string,
  ): Promise<BudgetReservation> {
    return runAudited(this.prisma, actorUserId, async (tx) => {
      const rows = await tx.$queryRaw<LockedReleaseRow[]>(Prisma.sql`
        SELECT id, status, reserved_amount, available_amount
        FROM budget_releases
        WHERE id = ${reservation.budgetReleaseId}::uuid
        FOR UPDATE
      `);
      const release = rows[0];
      if (!release) {
        throw new NotFoundException(`Budget release ${reservation.budgetReleaseId} not found.`);
      }

      const reservedAmount = new Prisma.Decimal(release.reserved_amount);
      const newReservedAmount = reservedAmount.minus(reservation.reservationAmount);

      // "No negative balances" — if this ever computes negative, it
      // means this reservation's amount was already released/cancelled
      // once before (a double-release bug), and this is a clear
      // application-level error rather than a raw DB constraint
      // violation reaching the caller.
      BudgetValidation.assertResultNotNegative(newReservedAmount, 'reserved_amount');

      await this.adjustReleaseBalance(tx, {
        releaseId: release.id,
        newReservedAmount,
        organizationId: reservation.organizationId,
        budgetReservationId: reservation.id,
        transactionType: 'reservation_cancellation',
        signedAmount: reservation.reservationAmount.negated(),
        actorUserId,
        remarks,
      });

      return this.applyVersionedUpdate(tx, reservation.id, expectedVersion, {
        status: newStatus,
        updatedBy: actorUserId ?? null,
      });
    });
  }

  /**
   * Shared by `submit()` (adds a positive delta when committing a
   * reservation) and `releaseHoldAndSetStatus()` (adds a negative delta
   * when releasing one back) — both were previously two independent
   * copies of the same steps (write the new reserved amount, log the
   * ledger entry) with opposite arithmetic sign. Takes the
   * already-computed `newReservedAmount` (each caller has its own
   * reason for computing it, and its own non-negative check already run
   * beforehand) rather than a raw delta, so this helper has no
   * arithmetic of its own to get wrong.
   */
  private async adjustReleaseBalance(
    tx: Prisma.TransactionClient,
    params: {
      releaseId: string;
      newReservedAmount: Prisma.Decimal;
      organizationId: string;
      budgetReservationId: string;
      transactionType: BudgetTransactionType;
      signedAmount: Prisma.Decimal;
      // Not marked optional (`?`) on purpose — these are always PASSED
      // (possibly as `undefined`) by both call sites below, and
      // `exactOptionalPropertyTypes` distinguishes "key omitted" from
      // "key present with value undefined"; requiring the key but
      // allowing its value to be undefined sidesteps that distinction
      // entirely rather than fighting it at every call site.
      actorUserId: string | undefined;
      remarks: string | undefined;
    },
  ): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE budget_releases
      SET reserved_amount = ${params.newReservedAmount.toFixed(2)}::numeric, updated_at = now()
      WHERE id = ${params.releaseId}::uuid
    `);

    await tx.budgetTransactionLog.create({
      data: {
        organizationId: params.organizationId,
        budgetReleaseId: params.releaseId,
        budgetReservationId: params.budgetReservationId,
        transactionType: params.transactionType,
        signedAmount: params.signedAmount,
        remarks: params.remarks ?? null,
        createdBy: params.actorUserId ?? null,
      },
    });
  }

  private async requireReservation(organizationId: string, reservationId: string): Promise<BudgetReservation> {
    const reservation = await this.prisma.budgetReservation.findFirst({
      where: { id: reservationId, organizationId },
    });
    if (!reservation) {
      throw new NotFoundException(`Budget reservation ${reservationId} not found.`);
    }
    return reservation;
  }

  private assertStatus(
    reservation: { status: BudgetReservationStatus },
    allowed: BudgetReservationStatus[],
    actionLabel: string,
  ): void {
    if (!allowed.includes(reservation.status)) {
      throw new BadRequestException(
        `Reservation is "${reservation.status}" and cannot be ${actionLabel} (allowed from: ${allowed.join(', ')}).`,
      );
    }
  }

  private async updateWithVersionCheck(
    id: string,
    expectedVersion: number,
    data: Prisma.BudgetReservationUncheckedUpdateManyInput,
    actorUserId?: string | null,
  ): Promise<BudgetReservation> {
    return runAudited(this.prisma, actorUserId, (tx) => this.applyVersionedUpdate(tx, id, expectedVersion, data));
  }

  /**
   * Optimistic-concurrency update: only succeeds if `version` still
   * matches what the caller last read. Works identically whether called
   * with the top-level PrismaService or a `$transaction` callback's `tx`
   * client, since both expose the same model API shape. Organization
   * ownership is already verified by the caller (via requireReservation
   * or submit's own row-locked, org-scoped SELECT) before this runs —
   * this helper only needs `id` + `version`.
   */
  private async applyVersionedUpdate(
    client: Pick<PrismaService, 'budgetReservation'>,
    id: string,
    expectedVersion: number,
    data: Prisma.BudgetReservationUncheckedUpdateManyInput,
  ): Promise<BudgetReservation> {
    const result = await client.budgetReservation.updateMany({
      where: { id, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new ConflictException('Reservation was modified concurrently — reload and try again.');
    }
    return client.budgetReservation.findUniqueOrThrow({ where: { id } });
  }
}
