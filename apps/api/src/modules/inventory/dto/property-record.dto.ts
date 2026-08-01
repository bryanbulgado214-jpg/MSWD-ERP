import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreatePropertyRecordDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsOptional()
  @IsUUID()
  stockReceiptItemId?: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

  @IsDateString()
  dateAcquired!: string;

  @IsNumber()
  acquisitionCost!: number;

  @IsOptional()
  @IsInt()
  estimatedUsefulLife?: number;

  @IsOptional()
  @IsNumber()
  salvageValue?: number;

  @IsOptional()
  @IsEnum(['brand_new', 'serviceable', 'unserviceable', 'poor', 'beyond_repair'])
  condition?: 'brand_new' | 'serviceable' | 'unserviceable' | 'poor' | 'beyond_repair';

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  accountableUserId?: string;
}

export class UpdatePropertyRecordDto {
  @IsInt()
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

  @IsOptional()
  @IsEnum(['brand_new', 'serviceable', 'unserviceable', 'poor', 'beyond_repair'])
  condition?: 'brand_new' | 'serviceable' | 'unserviceable' | 'poor' | 'beyond_repair';

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  accountableUserId?: string;

  @IsOptional()
  @IsBoolean()
  isDisposed?: boolean;
}
