import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { Env } from '../../config/env.validation';
import { PrismaService } from '../../database/prisma.service';

import type { JwtPayload } from './auth.service';

/** What ends up on `request.user` after a token passes verification. */
export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  username: string;
  fullName: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET', { infer: true }),
    });
  }

  /** Runs after signature/expiry verification passes. Re-checks the user
   * still exists and is active — a deactivated user's existing, still
   * technically-valid-looking token is rejected immediately rather than
   * only at next login. */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User no longer exists or is inactive.');
    }
    return {
      userId: user.id,
      organizationId: user.organizationId,
      username: user.username,
      fullName: user.fullName,
    };
  }
}
