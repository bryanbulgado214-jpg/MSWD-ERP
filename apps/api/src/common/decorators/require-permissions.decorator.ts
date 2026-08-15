import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/** Use as `@RequirePermissions('budgeting.reservation.create')` on a
 * controller class or individual route handler. Combine with
 * `@UseGuards(JwtAuthGuard, PermissionsGuard)` — PermissionsGuard reads
 * this metadata and checks it against the authenticated user's actual
 * granted permissions. Multiple codes means the user must have ALL of
 * them, not just one. */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const AUTH_ONLY_KEY = 'authenticatedOnly';

/**
 * Marks a route (or controller) as requiring only a valid login — no specific
 * permission. Use this ONLY when a route behind PermissionsGuard is
 * intentionally permission-free, because the guard now FAILS CLOSED: a guarded
 * route that declares neither `@RequirePermissions` nor `@AuthenticatedOnly`
 * is denied, so a forgotten decorator can never silently expose an endpoint.
 */
export const AuthenticatedOnly = () => SetMetadata(AUTH_ONLY_KEY, true);
