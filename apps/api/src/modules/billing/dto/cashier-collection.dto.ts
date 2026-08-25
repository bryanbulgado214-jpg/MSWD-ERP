import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// ── Admin-managed lookups ──

export class UpsertCollectorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsBoolean()
  @IsOptional()
  isCashier?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}

export class UpsertCollectionAreaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}

// ── Cashier daily collection report ──

export class CreateCashierReportDto {
  @IsDateString()
  reportDate!: string;

  @IsString()
  @IsOptional()
  remarks?: string;
}

export class UpdateCashierReportDto {
  @IsDateString()
  @IsOptional()
  reportDate?: string;

  @IsString()
  @IsOptional()
  remarks?: string;
}

export class CheckItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  checkNumber!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  bankName?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
}

export class CollectionLineDto {
  // A collection-type key (see collection-types.ts); resolves to a GL account
  // via the account mappings.
  @IsString()
  @IsNotEmpty()
  collectionType!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  // Required for the "Other" type: the cashier describes the collection so the
  // accountant can assign the correct GL account during review.
  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string;
}

export class UpsertCashierEntryDto {
  @IsUUID()
  collectorId!: string;

  @IsUUID()
  @IsOptional()
  collectionAreaId?: string;

  @IsDateString()
  collectionDate!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  orSeries!: string;

  // Breakdown of the remittance by type of collection (one or more). Their sum
  // is the declared total remittance per the teller's report.
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CollectionLineDto)
  lines!: CollectionLineDto[];

  // Checks received from customers (may be empty for an all-cash remittance).
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CheckItemDto)
  checks?: CheckItemDto[];

  // Denomination → quantity map, e.g. { "1000": 2, "500": 3, "0.25": 4 }.
  @IsObject()
  cashCount!: Record<string, number>;
}

export class SubmitCashierReportDto {
  @IsNumber()
  expectedVersion!: number;
}

export class RecordDepositDto {
  // The date the deposit appears on the passbook / bank statement.
  @IsDateString()
  depositDate!: string;

  // Bank account the collections were deposited to (its GL is debited).
  @IsUUID()
  bankAccountId!: string;
}
