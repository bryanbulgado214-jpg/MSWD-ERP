import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { getGrantedPermissionCodes } from '../../common/guards/get-granted-permission-codes';
import { PrismaService } from '../../database/prisma.service';
import type { SignatoryMap } from '../admin/organization-profile.service';

import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
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

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: true }> {
    return this.authService.changePassword(user.userId, dto.currentPassword, dto.newPassword);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<{
    user: { username: string; fullName: string | null };
    permissions: string[];
    organization: {
      id: string;
      name: string;
      legalName: string;
      address: string | null;
      contact: string | null;
      logoUrl: string | null;
      signatories: SignatoryMap;
    } | null;
  }> {
    const [codes, org] = await Promise.all([
      getGrantedPermissionCodes(this.prisma, user.userId),
      this.prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: {
          id: true,
          name: true,
          settings: {
            select: {
              legalName: true,
              address: true,
              contact: true,
              logoUrl: true,
              signatories: true,
            },
          },
        },
      }),
    ]);
    return {
      user: { username: user.username, fullName: user.fullName },
      permissions: Array.from(codes).sort(),
      organization: org
        ? {
            id: org.id,
            name: org.name,
            legalName: org.settings?.legalName ?? org.name,
            address: org.settings?.address ?? null,
            contact: org.settings?.contact ?? null,
            logoUrl: org.settings?.logoUrl ?? null,
            // Already sanitized on write; forms read slots defensively.
            signatories: (org.settings?.signatories as SignatoryMap | null) ?? {},
          }
        : null,
    };
  }
}
