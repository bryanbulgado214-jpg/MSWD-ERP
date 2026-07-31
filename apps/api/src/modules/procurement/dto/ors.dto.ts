import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class CreateOrsDto {
  @IsUUID()
  cafId!: string;

  @IsDateString()
  orsDate!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  originalAmount!: number;

  @IsOptional()
  @IsUUID()
  budgetLineId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  accountCode?: string;

  @IsOptional()
  @IsUUID()
  requestingOfficeId?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class OrsActionDto {
  @IsInt()
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateOrsChildDto {
  @IsIn(['billing', 'inspection', 'payable', 'disbursement_voucher', 'payment', 'retention', 'deduction', 'adjustment'])
  childType!: string;

  @IsDateString()
  childDate!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateOrsAdjustmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  adjustmentType!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  signedAmount!: number;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsUUID()
  cafId?: string;
}
