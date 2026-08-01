import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInventoryItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  itemCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  unitOfMeasure!: string;

  @IsEnum(['expendable', 'semi_expendable', 'ppe'])
  classification!: 'expendable' | 'semi_expendable' | 'ppe';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  accountCode?: string;

  @IsOptional()
  @IsNumber()
  reorderPoint?: number;
}

export class UpdateInventoryItemDto {
  @IsInt()
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  unitOfMeasure?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  accountCode?: string;

  @IsOptional()
  @IsNumber()
  reorderPoint?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
