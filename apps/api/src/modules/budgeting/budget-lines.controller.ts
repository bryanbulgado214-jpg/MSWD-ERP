import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { BudgetLineService } from './budget-line.service';
import { CreateBudgetLineDto, UpdateBudgetLineDto } from './dto/budget-line.dto';

@Controller('budgeting/budget-lines')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BudgetLinesController {
  constructor(private readonly budgetLineService: BudgetLineService) {}

  @Post()
  @RequirePermissions('budgeting.line.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBudgetLineDto) {
    return this.budgetLineService.create(user.organizationId, dto, user.userId);
  }

  @Get()
  @RequirePermissions('budgeting.read')
  findAllForHeader(@CurrentUser() user: AuthenticatedUser, @Query('budgetHeaderId', ParseUUIDPipe) budgetHeaderId: string) {
    return this.budgetLineService.findAllForHeader(user.organizationId, budgetHeaderId);
  }

  @Get(':id')
  @RequirePermissions('budgeting.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.budgetLineService.findOne(user.organizationId, id);
  }

  @Patch(':id')
  @RequirePermissions('budgeting.line.manage')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBudgetLineDto) {
    return this.budgetLineService.update(user.organizationId, id, dto, user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('budgeting.line.manage')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.budgetLineService.remove(user.organizationId, id);
  }
}
