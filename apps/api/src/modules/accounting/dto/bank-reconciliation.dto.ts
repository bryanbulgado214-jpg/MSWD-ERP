import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateBankReconciliationDto {
  @IsUUID()
  bankAccountId!: string;

  @IsUUID()
  accountingPeriodId!: string;

  @IsDateString()
  reconciliationDate!: string;

  @IsNumber()
  bookBalance!: number;

  @IsNumber()
  bankBalance!: number;
}

export class AddReconItemDto {
  @IsNumber()
  expectedVersion!: number;

  @IsString()
  @IsIn(['deposit_in_transit', 'outstanding_check', 'bank_charge', 'bank_credit', 'book_error', 'bank_error'])
  itemType!: string;

  @IsString()
  @IsOptional()
  referenceNumber?: string;

  @IsDateString()
  referenceDate!: string;

  @IsNumber()
  amount!: number;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsUUID()
  @IsOptional()
  checkId?: string;
}

export class RemoveReconItemDto {
  @IsNumber()
  expectedVersion!: number;
}

export class ReconActionDto {
  @IsNumber()
  expectedVersion!: number;
}
