import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDtrUploadDto {
  @IsString() @IsNotEmpty() periodStart!: string;
  @IsString() @IsNotEmpty() periodEnd!: string;
}

export class CreateDtrRecordDto {
  @IsString() @IsNotEmpty() employeeId!: string;
  @IsString() @IsNotEmpty() recordDate!: string;
  @IsString() @IsOptional() timeInAm?: string;
  @IsString() @IsOptional() timeOutAm?: string;
  @IsString() @IsOptional() timeInPm?: string;
  @IsString() @IsOptional() timeOutPm?: string;
  @IsOptional() isAbsent?: boolean;
  @IsOptional() isHoliday?: boolean;
  @IsOptional() isRestDay?: boolean;
  @IsString() @IsOptional() remarks?: string;
}

export class DtrQueryDto {
  @IsString() @IsOptional() employeeId?: string;
  @IsString() @IsOptional() startDate?: string;
  @IsString() @IsOptional() endDate?: string;
  @IsInt() @IsOptional() month?: number;
  @IsInt() @IsOptional() year?: number;
}
