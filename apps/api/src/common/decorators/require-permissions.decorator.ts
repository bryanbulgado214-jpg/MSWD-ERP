import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/** Use as `@RequirePermissions('budgeting.reservation.create')` on a
 * controller class or individual route handler. Combine with
 * `@UseGuards(JwtAuthGuard, PermissionsGuard)` — PermissionsGuard reads
 * this metadata and checks it against the authenticated user's actual
 * granted permissions. Multiple codes means the user must have ALL of
 * them, not just one. */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
