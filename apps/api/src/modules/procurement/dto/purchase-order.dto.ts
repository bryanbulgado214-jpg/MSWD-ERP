import { IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class CreatePurchaseOrderDto {
  @IsUUID()
  purchaseRequestId!: string;

  @IsUUID()
  supplierId!: string;

  @IsDateString()
  poDate!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  contractAmount!: number;

  @IsOptional()
  @IsDateString()
  awardDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  awardNoticeNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  modeOfProcurement?: string;

  @IsOptional()
  @IsString()
  deliveryTerms?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class UpdatePurchaseOrderDto {
  @IsInt()
  expectedVersion!: number;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsDateString()
  poDate?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  contractAmount?: number;

  @IsOptional()
  @IsDateString()
  awardDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  awardNoticeNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  modeOfProcurement?: string;

  @IsOptional()
  @IsString()
  deliveryTerms?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class PurchaseOrderActionDto {
  @IsInt()
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}
