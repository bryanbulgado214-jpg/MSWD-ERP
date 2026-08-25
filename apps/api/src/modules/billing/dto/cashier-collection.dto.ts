import {
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

export class UpsertCashierEntryDto {
  @IsUUID()
  collectorId!: string;

  @IsUUID()
  @IsOptional()
  collectionAreaId?: string;

  @IsDateString()
  collectionDate!: string;

  @IsUUID()
  glAccountId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  orSeries!: string;

  // Denomination → quantity map, e.g. { "1000": 2, "500": 3, "0.25": 4 }.
  @IsObject()
  cashCount!: Record<string, number>;
}

export class SubmitCashierReportDto {
  @IsNumber()
  expectedVersion!: number;
}
