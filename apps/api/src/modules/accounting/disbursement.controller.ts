import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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

import { DisbursementService } from './disbursement.service';
import { AddDvNoteDto, CreateDisbursementDto, UpdateDvNumberDto } from './dto/disbursement.dto';

@Controller('accounting/disbursements')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DisbursementController {
  constructor(private readonly disbursementService: DisbursementService) {}

  @Get()
  @RequirePermissions('accounting.dv.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('dvType') dvType?: string,
    @Query('withholding') withholding?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.disbursementService.list(user.organizationId, {
      ...(status ? { status } : {}),
      ...(dvType ? { dvType } : {}),
      ...(withholding === 'true' ? { withholding: true } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    });
  }

  @Get(':id/bir-2307')
  @RequirePermissions('accounting.dv.read')
  bir2307(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.disbursementService.getBir2307(user.organizationId, id);
  }

  @Get(':id')
  @RequirePermissions('accounting.dv.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.disbursementService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('accounting.dv.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDisbursementDto) {
    return this.disbursementService.create(user.organizationId, user.userId, dto);
  }

  @Post(':id/post')
  @RequirePermissions('accounting.dv.create')
  postDraft(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.disbursementService.postDraft(user.organizationId, user.userId, id);
  }

  @Patch(':id')
  @RequirePermissions('accounting.dv.create')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDisbursementDto,
  ) {
    return this.disbursementService.update(user.organizationId, user.userId, id, dto);
  }

  @Patch(':id/number')
  @RequirePermissions('accounting.dv.create')
  updateNumber(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDvNumberDto,
  ) {
    return this.disbursementService.updateNumber(
      user.organizationId,
      user.userId,
      id,
      dto.dvNumber,
    );
  }

  @Delete(':id')
  @RequirePermissions('accounting.dv.create')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.disbursementService.remove(user.organizationId, user.userId, id);
  }

  // ── Notes (preparer & approver can both comment) ──

  @Get(':id/notes')
  @RequirePermissions('accounting.dv.read')
  listNotes(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.disbursementService.listNotes(user.organizationId, id);
  }

  @Post(':id/notes')
  @RequirePermissions('accounting.dv.read')
  addNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddDvNoteDto,
  ) {
    return this.disbursementService.addNote(user.organizationId, id, user.userId, dto.body);
  }

  @Delete(':id/notes/:noteId')
  @RequirePermissions('accounting.dv.read')
  deleteNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ) {
    return this.disbursementService.deleteNote(user.organizationId, id, noteId, user.userId);
  }

  // ── Attachments (supporting documents) ──

  @Post(':id/attachments')
  @RequirePermissions('accounting.dv.read')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  addAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.disbursementService.addAttachment(user.organizationId, id, user.userId, file);
  }

  @Get(':id/attachments')
  @RequirePermissions('accounting.dv.read')
  listAttachments(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.disbursementService.listAttachments(user.organizationId, id);
  }

  @Get(':id/attachments/:attId/download')
  @RequirePermissions('accounting.dv.read')
  async downloadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attId', ParseUUIDPipe) attId: string,
    @Res() res: Response,
  ) {
    const f = await this.disbursementService.getAttachmentFile(user.organizationId, id, attId);
    res.download(f.abs, f.fileName);
  }

  @Delete(':id/attachments/:attId')
  @RequirePermissions('accounting.dv.create')
  deleteAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attId', ParseUUIDPipe) attId: string,
  ) {
    return this.disbursementService.deleteAttachment(user.organizationId, id, attId);
  }
}
