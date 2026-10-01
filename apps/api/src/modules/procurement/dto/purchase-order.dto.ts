import { IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class CreatePurchaseOrderDto {
  // Optional manual PO number. Leave blank to auto-generate (PO-000001);
  // supply your own to match an existing registry / paper record.
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  poNumber?: string;

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

export class ChangePurchaseOrderNumberDto {
  @IsInt()
  expectedVersion!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  poNumber!: string;
}

export class ChangePurchaseOrderDateDto {
  @IsInt()
  expectedVersion!: number;

  @IsDateString()
  poDate!: string;
}
