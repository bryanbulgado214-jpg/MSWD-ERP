import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class PurchaseRequestItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unitOfMeasure!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  estimatedUnitCost!: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  accountCode?: string;

  @IsOptional()
  @IsString()
  technicalSpecification?: string;

  @IsOptional()
  @IsIn(['inventory', 'asset', 'expense', 'infrastructure', 'service'])
  classification?: 'inventory' | 'asset' | 'expense' | 'infrastructure' | 'service';
}

export class CreatePurchaseRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsUUID()
  budgetReleaseId?: string;

  @IsOptional()
  @IsUUID()
  fiscalYearId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  departmentHeadId?: string;

  @IsOptional()
  @IsUUID()
  procurementCategoryId?: string;

  @IsOptional()
  @IsDateString()
  requestedDeliveryDate?: string;

  @IsOptional()
  @IsUUID()
  deliveryLocationId?: string;

  @IsOptional()
  @IsUUID()
  ppmpItemId?: string;

  @IsOptional()
  @IsUUID()
  appItemId?: string;

  @IsOptional()
  @IsUUID()
  budgetLineId?: string;

  @IsOptional()
  @IsUUID()
  responsibilityCenterId?: string;

  @IsOptional()
  @IsUUID()
  fundSourceId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestItemDto)
  items!: PurchaseRequestItemDto[];
}

export class UpdatePurchaseRequestDto {
  @IsInt()
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsUUID()
  budgetReleaseId?: string;

  @IsOptional()
  @IsUUID()
  fiscalYearId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  departmentHeadId?: string;

  @IsOptional()
  @IsUUID()
  procurementCategoryId?: string;

  @IsOptional()
  @IsDateString()
  requestedDeliveryDate?: string;

  @IsOptional()
  @IsUUID()
  deliveryLocationId?: string;

  @IsOptional()
  @IsUUID()
  ppmpItemId?: string;

  @IsOptional()
  @IsUUID()
  appItemId?: string;

  @IsOptional()
  @IsUUID()
  budgetLineId?: string;

  @IsOptional()
  @IsUUID()
  responsibilityCenterId?: string;

  @IsOptional()
  @IsUUID()
  fundSourceId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestItemDto)
  items?: PurchaseRequestItemDto[];
}

export class PurchaseRequestActionDto {
  @IsInt()
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}
