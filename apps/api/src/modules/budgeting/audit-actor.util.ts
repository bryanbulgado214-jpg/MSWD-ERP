import { Prisma } from '@prisma/client';

/**
 * Sets the `app.current_user_id` Postgres session variable for the
 * remainder of the CURRENT transaction only (`set_config(..., true)`
 * behaves exactly like `SET LOCAL` — it automatically reverts at
 * commit/rollback, so it can never leak onto a different request that
 * later reuses the same pooled connection).
 *
 * This is what makes the Core audit system's `fn_audit_log()` trigger
 * (apps/api/prisma/migrations/20260728054608_init_core_platform)
 * correctly populate `audit_logs.performed_by` — the trigger reads this
 * exact session variable via `current_setting('app.current_user_id',
 * true)`. Before this helper existed, nothing in the application ever
 * set it, so every audit_logs row's `performed_by` was silently NULL
 * regardless of who actually performed the action.
 *
 * MUST be called as the first statement inside a `$transaction`
 * callback, using that same `tx` client for every subsequent write in
 * the same callback — Prisma's connection pool does not guarantee two
 * separate top-level calls share a connection, so setting this outside
 * a transaction (or in a different transaction than the write it's
 * meant to attribute) would not work.
 */
export async function setAuditActor(
  tx: Prisma.TransactionClient,
  actorUserId: string | null | undefined,
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`SELECT set_config('app.current_user_id', ${actorUserId ?? ''}, true)`);
}

/**
 * Combines the two-step "open a transaction, then call setAuditActor as
 * its first statement" pattern that was repeated in every CRUD service's
 * create/update method (budget-cycle/version/header/line services) into
 * one call. Pure deduplication — behaves identically to writing out the
 * two steps by hand; nothing about what gets attributed to whom changes.
 */
export async function runAudited<T>(
  prisma: { $transaction: <R>(fn: (tx: Prisma.TransactionClient) => Promise<R>) => Promise<R> },
  actorUserId: string | null | undefined,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await setAuditActor(tx, actorUserId);
    return work(tx);
  });
}
