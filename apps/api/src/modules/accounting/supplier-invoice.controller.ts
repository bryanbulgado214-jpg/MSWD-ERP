import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { CreateSupplierInvoiceDto } from './dto/supplier-invoice.dto';
import { SupplierInvoiceService } from './supplier-invoice.service';

@Controller('accounting/supplier-invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SupplierInvoiceController {
  constructor(private readonly service: SupplierInvoiceService) {}

  @Get()
  @RequirePermissions('accounting.read')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('accounting.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(user.organizationId, id);
  }

  // Recording a supplier invoice posts its payable JEV, so it needs the same
  // permission as creating a journal entry.
  @Post()
  @RequirePermissions('accounting.jev.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSupplierInvoiceDto) {
    return this.service.create(user.organizationId, user.userId, dto);
  }
}
