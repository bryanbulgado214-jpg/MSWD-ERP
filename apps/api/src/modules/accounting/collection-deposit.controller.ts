import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { CollectionDepositService } from './collection-deposit.service';

class RecordDepositDto {
  @IsUUID()
  collectionBatchId!: string;

  @IsDateString()
  depositDate!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  depositAmount!: number;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsString()
  depositSlipNumber?: string;

  @IsOptional()
  @IsString()
  bankReference?: string;
}

@Controller('accounting/collection-deposits')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CollectionDepositController {
  constructor(private readonly service: CollectionDepositService) {}

  @Post()
  @RequirePermissions('collections.accounting.post')
  record(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordDepositDto) {
    return this.service.record(user.organizationId, user.userId, dto);
  }
}
