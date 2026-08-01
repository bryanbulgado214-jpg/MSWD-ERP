import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class PhysicalCountItemDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsOptional()
  @IsUUID()
  propertyRecordId?: string;

  @IsNumber()
  onHandPerCount!: number;

  @IsNumber()
  onHandPerCard!: number;

  @IsNumber()
  unitCost!: number;

  @IsOptional()
  @IsEnum(['brand_new', 'serviceable', 'unserviceable', 'poor', 'beyond_repair'])
  condition?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreatePhysicalCountDto {
  @IsDateString()
  countDate!: string;

  @IsEnum(['semi_annual_supplies', 'annual_ppe', 'annual_semi_expendable', 'spot_check'])
  countType!: string;

  @IsOptional()
  @IsUUID()
  fiscalYearId?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PhysicalCountItemDto)
  items!: PhysicalCountItemDto[];
}

export class SubmitPhysicalCountDto {
  @IsInt()
  expectedVersion!: number;
}

export class ApprovePhysicalCountDto {
  @IsInt()
  expectedVersion!: number;
}
