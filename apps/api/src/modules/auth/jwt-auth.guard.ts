import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Apply with `@UseGuards(JwtAuthGuard)` on any controller/route that
 * requires a signed-in user. Populates `request.user` (see
 * AuthenticatedUser in jwt.strategy.ts) on success. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
