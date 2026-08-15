import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { getGrantedPermissionCodes } from '../../common/guards/get-granted-permission-codes';
import type { PrismaService } from '../../database/prisma.service';

import type { AuthService } from './auth.service';
import type { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedUser } from './jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<{ accessToken: string }> {
    return this.authService.login(dto.username, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<{
    permissions: string[];
    organization: {
      id: string;
      name: string;
      legalName: string;
      address: string | null;
      contact: string | null;
      logoUrl: string | null;
    } | null;
  }> {
    const [codes, org] = await Promise.all([
      getGrantedPermissionCodes(this.prisma, user.userId),
      this.prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: {
          id: true,
          name: true,
          settings: { select: { legalName: true, address: true, contact: true, logoUrl: true } },
        },
      }),
    ]);
    return {
      permissions: Array.from(codes).sort(),
      organization: org
        ? {
            id: org.id,
            name: org.name,
            legalName: org.settings?.legalName ?? org.name,
            address: org.settings?.address ?? null,
            contact: org.settings?.contact ?? null,
            logoUrl: org.settings?.logoUrl ?? null,
          }
        : null,
    };
  }
}
