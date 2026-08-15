import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateChartOfAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  accountCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsEnum(['asset', 'liability', 'equity', 'revenue', 'expense'])
  accountType!: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

  @IsEnum(['debit', 'credit'])
  normalBalance!: 'debit' | 'credit';

  @IsInt()
  level!: number;

  @IsBoolean()
  isHeader!: boolean;

  @IsOptional()
  @IsString()
  parentAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  uacsCode?: string;
}

export class ImportCoaCsvDto {
  @IsString()
  @IsNotEmpty()
  csv!: string;
}

export class UpdateChartOfAccountDto {
  @IsInt()
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  uacsCode?: string;
}
