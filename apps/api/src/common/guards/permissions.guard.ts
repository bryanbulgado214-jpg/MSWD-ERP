import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../../modules/auth/jwt.strategy';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { getGrantedPermissionCodes } from './get-granted-permission-codes';

/**
 * Must run AFTER JwtAuthGuard (so `request.user` is already populated) —
 * apply both together: `@UseGuards(JwtAuthGuard, PermissionsGuard)`.
 *
 * Deliberately queries the database fresh on every request rather than
 * trusting anything baked into the JWT — see JwtPayload's doc comment in
 * auth.service.ts for why (immediate effect when a role/permission is
 * revoked, not delayed until token expiry).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true; // route declared no permission requirement
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) {
      // Should not happen if JwtAuthGuard ran first, but fail closed.
      throw new ForbiddenException('Not authenticated.');
    }

    const granted = await getGrantedPermissionCodes(this.prisma, user.userId);
    const missing = required.filter((code) => !granted.has(code));
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing required permission(s): ${missing.join(', ')}`);
    }
    return true;
  }
}
