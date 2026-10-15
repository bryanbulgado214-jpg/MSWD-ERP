import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const CCF_CATEGORIES = [
  'billing',
  'water_quality',
  'leakage',
  'low_pressure',
  'no_water',
  'meter_issue',
  'other',
] as const;

export const CCF_STATUSES = ['pending', 'in_progress', 'resolved', 'closed'] as const;

export class CreateCustomerConcernDto {
  @IsDateString()
  receivedAt!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  customerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNumber?: string;

  @IsIn(CCF_CATEGORIES)
  category!: (typeof CCF_CATEGORIES)[number];

  @IsString()
  @IsNotEmpty()
  nature!: string;

  @IsOptional()
  @IsString()
  requestedAction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  assignedTo?: string;

  @IsOptional()
  @IsDateString()
  targetResolutionDate?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class UpdateCustomerConcernDto {
  @IsInt()
  expectedVersion!: number;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNumber?: string;

  @IsOptional()
  @IsIn(CCF_CATEGORIES)
  category?: (typeof CCF_CATEGORIES)[number];

  @IsOptional()
  @IsString()
  nature?: string;

  @IsOptional()
  @IsString()
  requestedAction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  assignedTo?: string;

  @IsOptional()
  @IsString()
  actionTaken?: string;

  @IsOptional()
  @IsIn(CCF_STATUSES)
  status?: (typeof CCF_STATUSES)[number];

  @IsOptional()
  @IsDateString()
  targetResolutionDate?: string;

  @IsOptional()
  @IsDateString()
  resolvedAt?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
