import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateBillingPeriodDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  billingMonth!: number;

  @IsInt()
  @Min(2000)
  billingYear!: number;

  @IsDateString()
  @IsOptional()
  readingStartDate?: string;

  @IsDateString()
  @IsOptional()
  readingEndDate?: string;

  @IsDateString()
  dueDate!: string;

  @IsDateString()
  penaltyDate!: string;
}

export class UpdateBillingPeriodDto {
  @IsInt()
  expectedVersion!: number;

  @IsString()
  @IsOptional()
  name?: string;

  @IsDateString()
  @IsOptional()
  readingStartDate?: string;

  @IsDateString()
  @IsOptional()
  readingEndDate?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsDateString()
  @IsOptional()
  penaltyDate?: string;
}

export class TransitionPeriodDto {
  @IsInt()
  expectedVersion!: number;

  @IsEnum(['reading', 'billing', 'closed'])
  status!: 'reading' | 'billing' | 'closed';
}
