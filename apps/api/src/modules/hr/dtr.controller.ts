import { Body, Controller, Get, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateDtrRecordDto, CreateDtrUploadDto } from './dto/dtr.dto';
import { DtrService } from './dtr.service';

@Controller('hr/dtr')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DtrController {
  constructor(private readonly dtrService: DtrService) {}

  @Get('records')
  @RequirePermissions('hr.read')
  findRecords(
    @CurrentUser() user: AuthenticatedUser,
    @Query('employeeId') employeeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.dtrService.findRecords(user.organizationId, {
      ...(employeeId ? { employeeId } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(month ? { month: parseInt(month, 10) } : {}),
      ...(year ? { year: parseInt(year, 10) } : {}),
    });
  }

  @Get('uploads')
  @RequirePermissions('hr.attendance.manage')
  findUploads(@CurrentUser() user: AuthenticatedUser) {
    return this.dtrService.findUploads(user.organizationId);
  }

  @Post('records')
  @RequirePermissions('hr.attendance.manage')
  createRecord(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDtrRecordDto) {
    return this.dtrService.createRecord(user.organizationId, {
      employeeId: dto.employeeId,
      recordDate: dto.recordDate,
      ...(dto.timeInAm ? { timeInAm: dto.timeInAm } : {}),
      ...(dto.timeOutAm ? { timeOutAm: dto.timeOutAm } : {}),
      ...(dto.timeInPm ? { timeInPm: dto.timeInPm } : {}),
      ...(dto.timeOutPm ? { timeOutPm: dto.timeOutPm } : {}),
      ...(dto.isAbsent !== undefined ? { isAbsent: dto.isAbsent } : {}),
      ...(dto.isHoliday !== undefined ? { isHoliday: dto.isHoliday } : {}),
      ...(dto.isRestDay !== undefined ? { isRestDay: dto.isRestDay } : {}),
      ...(dto.remarks ? { remarks: dto.remarks } : {}),
    });
  }

  @Post('upload')
  @RequirePermissions('hr.attendance.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadDtr(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateDtrUploadDto,
  ) {
    if (!file) throw new Error('No file uploaded');
    return this.dtrService.processExcelUpload(
      user.organizationId,
      file.buffer,
      file.originalname,
      dto.periodStart,
      dto.periodEnd,
      user.userId,
    );
  }
}
