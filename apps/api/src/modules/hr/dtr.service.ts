import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

interface ParsedDtrRow {
  employeeNumber: string;
  recordDate: string;
  timeInAm: string | null;
  timeOutAm: string | null;
  timeInPm: string | null;
  timeOutPm: string | null;
  remarks: string | null;
}

@Injectable()
export class DtrService {
  constructor(private readonly prisma: PrismaService) {}

  async findRecords(orgId: string, filters?: {
    employeeId?: string;
    startDate?: string;
    endDate?: string;
    month?: number;
    year?: number;
  }) {
    const where: Record<string, unknown> = { organizationId: orgId };
    if (filters?.employeeId) where.employeeId = filters.employeeId;

    if (filters?.startDate && filters?.endDate) {
      where.recordDate = { gte: new Date(filters.startDate), lte: new Date(filters.endDate) };
    } else if (filters?.month !== undefined && filters?.year !== undefined) {
      const start = new Date(filters.year, filters.month - 1, 1);
      const end = new Date(filters.year, filters.month, 0);
      where.recordDate = { gte: start, lte: end };
    }

    return this.prisma.dtrRecord.findMany({
      where,
      include: {
        employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
      },
      orderBy: [{ recordDate: 'asc' }],
    });
  }

  async findUploads(orgId: string) {
    return this.prisma.dtrUpload.findMany({
      where: { organizationId: orgId },
      include: {
        uploader: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRecord(orgId: string, data: {
    employeeId: string;
    recordDate: string;
    timeInAm?: string;
    timeOutAm?: string;
    timeInPm?: string;
    timeOutPm?: string;
    isAbsent?: boolean;
    isHoliday?: boolean;
    isRestDay?: boolean;
    remarks?: string;
  }) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: data.employeeId, organizationId: orgId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const { hoursWorked, hoursLate, hoursUndertime } = this.calculateHours(
      data.timeInAm ?? null,
      data.timeOutAm ?? null,
      data.timeInPm ?? null,
      data.timeOutPm ?? null,
    );

    return this.prisma.dtrRecord.upsert({
      where: {
        employeeId_recordDate: {
          employeeId: data.employeeId,
          recordDate: new Date(data.recordDate),
        },
      },
      create: {
        organizationId: orgId,
        employeeId: data.employeeId,
        recordDate: new Date(data.recordDate),
        ...(data.timeInAm ? { timeInAm: this.parseTime(data.timeInAm) } : {}),
        ...(data.timeOutAm ? { timeOutAm: this.parseTime(data.timeOutAm) } : {}),
        ...(data.timeInPm ? { timeInPm: this.parseTime(data.timeInPm) } : {}),
        ...(data.timeOutPm ? { timeOutPm: this.parseTime(data.timeOutPm) } : {}),
        hoursWorked,
        hoursLate,
        hoursUndertime,
        ...(data.isAbsent !== undefined ? { isAbsent: data.isAbsent } : {}),
        ...(data.isHoliday !== undefined ? { isHoliday: data.isHoliday } : {}),
        ...(data.isRestDay !== undefined ? { isRestDay: data.isRestDay } : {}),
        ...(data.remarks ? { remarks: data.remarks } : {}),
      },
      update: {
        ...(data.timeInAm ? { timeInAm: this.parseTime(data.timeInAm) } : {}),
        ...(data.timeOutAm ? { timeOutAm: this.parseTime(data.timeOutAm) } : {}),
        ...(data.timeInPm ? { timeInPm: this.parseTime(data.timeInPm) } : {}),
        ...(data.timeOutPm ? { timeOutPm: this.parseTime(data.timeOutPm) } : {}),
        hoursWorked,
        hoursLate,
        hoursUndertime,
        ...(data.isAbsent !== undefined ? { isAbsent: data.isAbsent } : {}),
        ...(data.isHoliday !== undefined ? { isHoliday: data.isHoliday } : {}),
        ...(data.isRestDay !== undefined ? { isRestDay: data.isRestDay } : {}),
        ...(data.remarks !== undefined ? { remarks: data.remarks || null } : {}),
      },
    });
  }

  async processExcelUpload(
    orgId: string,
    fileBuffer: Buffer,
    fileName: string,
    periodStart: string,
    periodEnd: string,
    actorId: string,
  ) {
    const rows = this.parseExcel(fileBuffer);
    if (rows.length === 0) throw new BadRequestException('No valid DTR records found in file');

    return runAudited(this.prisma, actorId, async (tx) => {
      const upload = await tx.dtrUpload.create({
        data: {
          organizationId: orgId,
          fileName,
          periodStart: new Date(periodStart),
          periodEnd: new Date(periodEnd),
          totalRecords: rows.length,
          status: 'pending',
          uploadedBy: actorId,
        },
      });

      const employees = await tx.employee.findMany({
        where: { organizationId: orgId },
        select: { id: true, employeeNumber: true },
      });
      const empMap = new Map(employees.map((e) => [e.employeeNumber, e.id]));

      let processed = 0;
      let errors = 0;
      const errorMessages: string[] = [];

      for (const row of rows) {
        const empId = empMap.get(row.employeeNumber);
        if (!empId) {
          errors++;
          errorMessages.push(`Row: Employee ${row.employeeNumber} not found`);
          continue;
        }

        try {
          const { hoursWorked, hoursLate, hoursUndertime } = this.calculateHours(
            row.timeInAm,
            row.timeOutAm,
            row.timeInPm,
            row.timeOutPm,
          );

          await tx.dtrRecord.upsert({
            where: {
              employeeId_recordDate: {
                employeeId: empId,
                recordDate: new Date(row.recordDate),
              },
            },
            create: {
              organizationId: orgId,
              employeeId: empId,
              uploadId: upload.id,
              recordDate: new Date(row.recordDate),
              ...(row.timeInAm ? { timeInAm: this.parseTime(row.timeInAm) } : {}),
              ...(row.timeOutAm ? { timeOutAm: this.parseTime(row.timeOutAm) } : {}),
              ...(row.timeInPm ? { timeInPm: this.parseTime(row.timeInPm) } : {}),
              ...(row.timeOutPm ? { timeOutPm: this.parseTime(row.timeOutPm) } : {}),
              hoursWorked,
              hoursLate,
              hoursUndertime,
              ...(row.remarks ? { remarks: row.remarks } : {}),
            },
            update: {
              uploadId: upload.id,
              ...(row.timeInAm ? { timeInAm: this.parseTime(row.timeInAm) } : {}),
              ...(row.timeOutAm ? { timeOutAm: this.parseTime(row.timeOutAm) } : {}),
              ...(row.timeInPm ? { timeInPm: this.parseTime(row.timeInPm) } : {}),
              ...(row.timeOutPm ? { timeOutPm: this.parseTime(row.timeOutPm) } : {}),
              hoursWorked,
              hoursLate,
              hoursUndertime,
              ...(row.remarks !== null ? { remarks: row.remarks } : {}),
            },
          });
          processed++;
        } catch (e: unknown) {
          errors++;
          const msg = e instanceof Error ? e.message : String(e);
          errorMessages.push(`Row ${row.employeeNumber}/${row.recordDate}: ${msg}`);
        }
      }

      await tx.dtrUpload.update({
        where: { id: upload.id },
        data: {
          processedRecords: processed,
          errorRecords: errors,
          status: errors > 0 && processed === 0 ? 'error' : 'processed',
          processedAt: new Date(),
          ...(errorMessages.length > 0 ? { errorLog: errorMessages.join('\n') } : {}),
        },
      });

      return tx.dtrUpload.findUnique({
        where: { id: upload.id },
        include: { uploader: { select: { id: true, username: true } } },
      });
    });
  }

  private parseExcel(buffer: Buffer): ParsedDtrRow[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new BadRequestException('Excel file has no sheets');

    const sheet = workbook.Sheets[sheetName]!;
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    const rows: ParsedDtrRow[] = [];
    for (const raw of jsonData) {
      const empNum = this.findColumn(raw, ['employee_number', 'employee_no', 'emp_no', 'emp_number', 'employeenumber', 'empno', 'employee #', 'emp #', 'id_no', 'idno', 'id no']);
      const dateVal = this.findColumn(raw, ['date', 'record_date', 'recorddate', 'dtr_date', 'attendance_date']);

      if (!empNum || !dateVal) continue;

      const recordDate = this.parseDate(dateVal);
      if (!recordDate) continue;

      rows.push({
        employeeNumber: String(empNum).trim(),
        recordDate,
        timeInAm: this.findTimeColumn(raw, ['time_in_am', 'am_in', 'morning_in', 'am_time_in', 'timeinam']),
        timeOutAm: this.findTimeColumn(raw, ['time_out_am', 'am_out', 'morning_out', 'am_time_out', 'timeoutam']),
        timeInPm: this.findTimeColumn(raw, ['time_in_pm', 'pm_in', 'afternoon_in', 'pm_time_in', 'timeinpm']),
        timeOutPm: this.findTimeColumn(raw, ['time_out_pm', 'pm_out', 'afternoon_out', 'pm_time_out', 'timeoutpm']),
        remarks: this.findColumn(raw, ['remarks', 'notes', 'comment']) as string | null,
      });
    }

    return rows;
  }

  private findColumn(row: Record<string, unknown>, candidates: string[]): unknown {
    for (const key of Object.keys(row)) {
      const normalized = key.toLowerCase().replace(/[\s_-]/g, '');
      for (const candidate of candidates) {
        if (normalized === candidate.replace(/[\s_-]/g, '')) {
          const val = row[key];
          return val === '' ? null : val;
        }
      }
    }
    return null;
  }

  private findTimeColumn(row: Record<string, unknown>, candidates: string[]): string | null {
    const val = this.findColumn(row, candidates);
    if (val === null || val === undefined || val === '') return null;

    if (typeof val === 'number') {
      const totalMinutes = Math.round(val * 24 * 60);
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    const str = String(val).trim();
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) return str.substring(0, 5);
    if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(str)) {
      const match = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (match) {
        let h = parseInt(match[1]!, 10);
        const m = match[2]!;
        const period = match[3]!.toUpperCase();
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:${m}`;
      }
    }

    return str.substring(0, 5);
  }

  private parseDate(val: unknown): string | null {
    if (typeof val === 'number') {
      const date = XLSX.SSF.parse_date_code(val);
      if (date) {
        return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
      }
    }
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(str)) {
      const parts = str.split('/');
      return `${parts[2]!}-${parts[0]!.padStart(2, '0')}-${parts[1]!.padStart(2, '0')}`;
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
    return null;
  }

  private parseTime(timeStr: string): Date {
    const parts = timeStr.split(':');
    const h = parseInt(parts[0] ?? '0', 10);
    const m = parseInt(parts[1] ?? '0', 10);
    return new Date(1970, 0, 1, h, m, 0);
  }

  private calculateHours(
    timeInAm: string | null,
    timeOutAm: string | null,
    timeInPm: string | null,
    timeOutPm: string | null,
  ): { hoursWorked: number; hoursLate: number; hoursUndertime: number } {
    let totalMinutes = 0;
    let lateMinutes = 0;
    let undertimeMinutes = 0;

    const AM_START = 8 * 60;
    const AM_END = 12 * 60;
    const PM_START = 13 * 60;
    const PM_END = 17 * 60;

    if (timeInAm && timeOutAm) {
      const inMins = this.timeToMinutes(timeInAm);
      const outMins = this.timeToMinutes(timeOutAm);
      if (inMins > AM_START) lateMinutes += inMins - AM_START;
      const effectiveOut = Math.min(outMins, AM_END);
      const effectiveIn = Math.max(inMins, AM_START);
      if (effectiveOut > effectiveIn) totalMinutes += effectiveOut - effectiveIn;
      if (outMins < AM_END) undertimeMinutes += AM_END - outMins;
    }

    if (timeInPm && timeOutPm) {
      const inMins = this.timeToMinutes(timeInPm);
      const outMins = this.timeToMinutes(timeOutPm);
      if (inMins > PM_START) lateMinutes += inMins - PM_START;
      const effectiveOut = Math.min(outMins, PM_END);
      const effectiveIn = Math.max(inMins, PM_START);
      if (effectiveOut > effectiveIn) totalMinutes += effectiveOut - effectiveIn;
      if (outMins < PM_END) undertimeMinutes += PM_END - outMins;
    }

    return {
      hoursWorked: Math.round((totalMinutes / 60) * 100) / 100,
      hoursLate: Math.round((lateMinutes / 60) * 100) / 100,
      hoursUndertime: Math.round((undertimeMinutes / 60) * 100) / 100,
    };
  }

  private timeToMinutes(time: string): number {
    const parts = time.split(':');
    return parseInt(parts[0] ?? '0', 10) * 60 + parseInt(parts[1] ?? '0', 10);
  }
}
