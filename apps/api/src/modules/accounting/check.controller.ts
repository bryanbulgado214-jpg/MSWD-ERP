import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import type { CheckService } from './check.service';
import type { PrintCheckDto, TransitionCheckDto, VoidCheckDto } from './dto/check.dto';

@Controller('accounting/checks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CheckController {
  constructor(private readonly checkService: CheckService) {}

  @Get()
  @RequirePermissions('accounting.check.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('bankAccountId') bankAccountId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.checkService.findAll(user.organizationId, {
      ...(bankAccountId ? { bankAccountId } : {}),
      ...(status ? { status } : {}),
      ...(search ? { search } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('accounting.check.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checkService.findOne(user.organizationId, id);
  }

  // Cashier assigns the physical check number and prints. Checks are never
  // created manually — they originate from Disbursement Vouchers.
  @Post(':id/print')
  @RequirePermissions('accounting.check.print')
  print(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PrintCheckDto,
  ) {
    return this.checkService.printCheck(user.organizationId, user.userId, id, dto);
  }

  // Cashier records the forward lifecycle (release, clearing). Void/spoil are
  // NOT allowed here — they require an approver via the void endpoint.
  @Post(':id/transition')
  @RequirePermissions('accounting.check.record_release')
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionCheckDto,
  ) {
    return this.checkService.transition(user.organizationId, id, user.userId, dto);
  }

  // Approver-only (General Manager): void/spoil a check. The service enforces
  // maker != checker — whoever prepared/printed/released it cannot void it.
  @Post(':id/void')
  @RequirePermissions('accounting.check.void')
  void(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidCheckDto,
  ) {
    return this.checkService.voidCheck(user.organizationId, user.userId, id, {
      expectedVersion: dto.expectedVersion,
      toStatus: dto.toStatus as 'voided' | 'spoiled',
      remarks: dto.remarks,
    });
  }
}
