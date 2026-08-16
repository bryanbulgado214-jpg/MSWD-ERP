import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

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
  @IsIn([
    'deposit_in_transit',
    'outstanding_check',
    'bank_charge',
    'bank_credit',
    'book_error',
    'bank_error',
  ])
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

// ── Match-and-clear reconciliation (QuickBooks/Intacct style) ──

export class ImportStatementLineDto {
  @IsDateString()
  transactionDate!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber()
  amount!: number;

  @IsString()
  @IsOptional()
  referenceNumber?: string;
}

export class ImportStatementLinesDto {
  @IsNumber()
  expectedVersion!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportStatementLineDto)
  lines!: ImportStatementLineDto[];
}

export class MatchLineDto {
  @IsUUID()
  statementLineId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  jevLineIds!: string[];
}

export class UnmatchLineDto {
  @IsUUID()
  statementLineId!: string;
}

export class CreateEntryFromLineDto {
  @IsUUID()
  statementLineId!: string;

  @IsUUID()
  accountId!: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class RemoveReconItemDto {
  @IsNumber()
  expectedVersion!: number;
}

export class ReconActionDto {
  @IsNumber()
  expectedVersion!: number;
}
