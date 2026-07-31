import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateDvDto {
  @IsUUID()
  orsId!: string;

  @IsString()
  particulars!: string;

  @IsEnum(['check', 'ada', 'others'])
  @IsOptional()
  paymentMode?: 'check' | 'ada' | 'others';

  @IsNumber()
  grossAmount!: number;

  @IsNumber()
  @IsOptional()
  taxAmount?: number;

  @IsNumber()
  @IsOptional()
  otherDeductions?: number;

  @IsOptional()
  @IsUUID()
  inspectionReportId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  accountCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  checkNumber?: string;

  @IsOptional()
  @IsDateString()
  checkDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;
}

export class DvActionDto {
  @IsNumber()
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  checkNumber?: string;

  @IsOptional()
  @IsDateString()
  checkDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;
}
