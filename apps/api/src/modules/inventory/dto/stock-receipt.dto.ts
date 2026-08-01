import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

export class StockReceiptItemDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsNumber()
  quantityReceived!: number;

  @IsNumber()
  unitCost!: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lotNumber?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class CreateStockReceiptDto {
  @IsDateString()
  receiptDate!: string;

  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @IsOptional()
  @IsUUID()
  inspectionReportId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockReceiptItemDto)
  items!: StockReceiptItemDto[];
}

export class PostStockReceiptDto {
  @IsNumber()
  expectedVersion!: number;
}
