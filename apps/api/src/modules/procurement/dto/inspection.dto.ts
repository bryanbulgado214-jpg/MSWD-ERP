import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class InspectionItemDto {
  @IsOptional()
  @IsUUID()
  prItemId?: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  unitOfMeasure?: string;

  @IsNumber()
  quantityOrdered!: number;

  @IsNumber()
  quantityDelivered!: number;

  @IsNumber()
  quantityAccepted!: number;

  @IsNumber()
  quantityRejected!: number;

  @IsString()
  @MaxLength(20)
  result!: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateInspectionReportDto {
  @IsUUID()
  purchaseOrderId!: string;

  @IsDateString()
  deliveryDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsString()
  findings?: string;

  @IsOptional()
  @IsString()
  recommendations?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InspectionItemDto)
  items!: InspectionItemDto[];
}

export class InspectionActionDto {
  @IsNumber()
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}
