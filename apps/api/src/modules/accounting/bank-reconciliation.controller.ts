import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { BankReconciliationService } from './bank-reconciliation.service';
import {
  AddReconItemDto,
  CreateBankReconciliationDto,
  CreateEntryFromLineDto,
  ImportStatementLinesDto,
  MatchLineDto,
  ReconActionDto,
  RemoveReconItemDto,
  UnmatchLineDto,
} from './dto/bank-reconciliation.dto';

@Controller('accounting/reconciliations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BankReconciliationController {
  constructor(private readonly reconService: BankReconciliationService) {}

  @Get()
  @RequirePermissions('accounting.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('bankAccountId') bankAccountId?: string,
    @Query('status') status?: string,
  ) {
    return this.reconService.findAll(user.organizationId, {
      ...(bankAccountId ? { bankAccountId } : {}),
      ...(status ? { status } : {}),
    });
  }

  @Get('gl-balance')
  @RequirePermissions('accounting.read')
  glBalance(
    @CurrentUser() user: AuthenticatedUser,
    @Query('bankAccountId') bankAccountId: string,
    @Query('asOfDate') asOfDate: string,
    @Query('accountingPeriodId') accountingPeriodId: string,
  ) {
    return this.reconService.getGlCashBalance(
      user.organizationId,
      bankAccountId,
      asOfDate,
      accountingPeriodId,
    );
  }

  @Get(':id')
  @RequirePermissions('accounting.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reconService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('accounting.bank.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBankReconciliationDto) {
    return this.reconService.create(user.organizationId, user.userId, dto);
  }

  @Post(':id/items')
  @RequirePermissions('accounting.bank.manage')
  addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddReconItemDto,
  ) {
    return this.reconService.addItem(user.organizationId, id, user.userId, dto);
  }

  @Get(':id/match')
  @RequirePermissions('accounting.read')
  getMatchView(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reconService.getMatchView(user.organizationId, id);
  }

  @Post(':id/import')
  @RequirePermissions('accounting.bank.manage')
  importStatementLines(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportStatementLinesDto,
  ) {
    return this.reconService.importStatementLines(user.organizationId, id, user.userId, dto);
  }

  @Post(':id/match')
  @RequirePermissions('accounting.bank.manage')
  match(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MatchLineDto,
  ) {
    return this.reconService.match(user.organizationId, id, user.userId, dto);
  }

  @Post(':id/unmatch')
  @RequirePermissions('accounting.bank.manage')
  unmatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UnmatchLineDto,
  ) {
    return this.reconService.unmatch(user.organizationId, id, user.userId, dto);
  }

  @Post(':id/auto-match')
  @RequirePermissions('accounting.bank.manage')
  autoMatch(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reconService.autoMatch(user.organizationId, id, user.userId);
  }

  @Post(':id/create-entry')
  @RequirePermissions('accounting.bank.manage')
  createEntryFromLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateEntryFromLineDto,
  ) {
    return this.reconService.createEntryFromLine(user.organizationId, id, user.userId, dto);
  }

  @Post(':id/attachments')
  @RequirePermissions('accounting.bank.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  addAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.reconService.addAttachment(user.organizationId, id, user.userId, file);
  }

  @Get(':id/attachments')
  @RequirePermissions('accounting.read')
  listAttachments(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reconService.listAttachments(user.organizationId, id);
  }

  @Get(':id/attachments/:attId/download')
  @RequirePermissions('accounting.read')
  async downloadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attId', ParseUUIDPipe) attId: string,
    @Res() res: Response,
  ) {
    const f = await this.reconService.getAttachmentFile(user.organizationId, id, attId);
    res.download(f.abs, f.fileName);
  }

  @Delete(':id/items/:itemId')
  @RequirePermissions('accounting.bank.manage')
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: RemoveReconItemDto,
  ) {
    return this.reconService.removeItem(
      user.organizationId,
      id,
      itemId,
      user.userId,
      dto.expectedVersion,
    );
  }

  @Delete(':id')
  @RequirePermissions('accounting.bank.manage')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reconService.remove(user.organizationId, user.userId, id);
  }

  @Post(':id/complete')
  @RequirePermissions('accounting.bank.manage')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReconActionDto,
  ) {
    return this.reconService.complete(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/approve')
  @RequirePermissions('accounting.bank.manage')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReconActionDto,
  ) {
    return this.reconService.approve(user.organizationId, id, user.userId, dto.expectedVersion);
  }
}
