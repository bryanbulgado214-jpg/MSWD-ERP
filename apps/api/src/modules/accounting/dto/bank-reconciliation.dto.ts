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

const RECON_ITEM_TYPES = [
  'deposit_in_transit',
  'outstanding_check',
  'bank_charge',
  'bank_credit',
  'book_error',
  'bank_error',
];

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

export class BulkReconItemDto {
  @IsString()
  @IsIn(RECON_ITEM_TYPES)
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
}

export class BulkReconItemsDto {
  @IsNumber()
  expectedVersion!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkReconItemDto)
  items!: BulkReconItemDto[];
}

export class RemoveReconItemDto {
  @IsNumber()
  expectedVersion!: number;
}

export class ReconActionDto {
  @IsNumber()
  expectedVersion!: number;
}
