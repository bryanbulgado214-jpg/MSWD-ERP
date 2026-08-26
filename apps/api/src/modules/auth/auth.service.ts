import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../../database/prisma.service';

/** Shape encoded into the JWT. Deliberately minimal — no permissions are
 * baked in here; PermissionsGuard looks those up fresh from the database
 * on every request, so revoking a role takes effect immediately instead
 * of waiting for the token to expire. */
export interface JwtPayload {
  sub: string; // user id
  organizationId: string;
  username: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(username: string, password: string): Promise<{ accessToken: string }> {
    // Username is unique per-organization, not globally (Core Platform
    // schema) — for a single-organization deployment this is
    // unambiguous; a future multi-org login screen would need to also
    // collect which organization, or resolve it from a subdomain/tenant
    // header. Out of scope here.
    const user = await this.prisma.user.findFirst({ where: { username, isActive: true } });
    if (!user) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      username: user.username,
    };

    return { accessToken: await this.jwtService.signAsync(payload) };
  }

  /** Self-service password change for the logged-in user. Requires the current
   * password (so a walk-up on an unlocked session can't silently reset it). */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User no longer exists.');
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new BadRequestException('Your current password is incorrect.');
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException('The new password must be different from the current one.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { success: true };
  }
}
