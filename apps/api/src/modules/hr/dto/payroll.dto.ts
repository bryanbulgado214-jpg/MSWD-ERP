import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePayrollPeriodDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsIn(['semi_monthly', 'monthly', 'weekly', 'biweekly'])
  @IsOptional()
  periodType?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsDateString()
  payDate!: string;
}

export class LockPayrollPeriodDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedVersion!: number;
}

export class CreatePayrollRunDto {
  @IsString()
  @IsNotEmpty()
  payrollPeriodId!: string;

  @IsString()
  @IsOptional()
  remarks?: string;
}

export class ComputePayrollDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedVersion!: number;
}

export class ApprovePayrollDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedVersion!: number;
}

export class PayPayrollDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedVersion!: number;
}

export class VoidPayrollDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  voidReason!: string;
}

export class PayrollRunQueryDto {
  @IsString()
  @IsOptional()
  payrollPeriodId?: string;

  @IsString()
  @IsOptional()
  status?: string;
}

export class PayrollPeriodQueryDto {
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  year?: number;
}
