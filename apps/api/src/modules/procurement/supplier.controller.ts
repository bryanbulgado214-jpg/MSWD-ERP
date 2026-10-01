import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAnyPermissions, RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateProcurementPayeeDto, CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { SupplierService } from './supplier.service';

@Controller('procurement/suppliers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Get()
  @RequirePermissions('procurement.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.supplierService.findAll(user.organizationId, includeInactive === 'true');
  }

  // The shared supplier master (accounting payee list) for the New PO page.
  // Declared before :id so "payees" isn't captured as an :id param.
  @Get('payees')
  @RequirePermissions('procurement.read')
  listPayees(@CurrentUser() user: AuthenticatedUser) {
    return this.supplierService.listPayees(user.organizationId);
  }

  // Quick-add a supplier into the shared master (so it also shows in accounting).
  // Allowed for a supplier manager OR anyone who can raise a PO.
  @Post('payees')
  @RequireAnyPermissions('procurement.supplier.manage', 'procurement.po.create')
  createPayee(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProcurementPayeeDto) {
    return this.supplierService.createPayee(user.organizationId, user.userId, dto);
  }

  @Get(':id')
  @RequirePermissions('procurement.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.supplierService.findOne(user.organizationId, id);
  }

  // Either a supplier manager OR anyone who can raise a PO (so the purchase
  // officer can quick-add a supplier inline while creating a purchase order).
  @Post()
  @RequireAnyPermissions('procurement.supplier.manage', 'procurement.po.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSupplierDto,
  ) {
    return this.supplierService.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('procurement.supplier.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.supplierService.update(user.organizationId, id, user.userId, dto);
  }
}
