import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class PaymentAllocationDto {
  @IsUUID()
  @IsNotEmpty()
  billId!: string;

  @IsNumber()
  @Min(0.01)
  amountApplied!: number;
}

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  orNumber!: string;

  @IsUUID()
  @IsNotEmpty()
  consumerId!: string;

  @IsDateString()
  @IsNotEmpty()
  paymentDate!: string;

  @IsNumber()
  @Min(0.01)
  totalAmount!: number;

  @IsEnum(['cash', 'check', 'online', 'bank_deposit'])
  paymentMethod!: string;

  @IsOptional()
  @IsString()
  checkNumber?: string;

  @IsOptional()
  @IsDateString()
  checkDate?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations!: PaymentAllocationDto[];
}

class OtherCollectionLineDto {
  @IsUUID()
  @IsNotEmpty()
  collectionTypeId!: string;

  @IsNumber()
  @Min(0.01)
  amountApplied!: number;
}

export class CreateOtherCollectionDto {
  @IsString()
  @IsNotEmpty()
  orNumber!: string;

  @IsOptional()
  @IsUUID()
  consumerId?: string;

  @IsOptional()
  @IsString()
  payerName?: string;

  @IsOptional()
  @IsString()
  applicationRef?: string;

  @IsDateString()
  @IsNotEmpty()
  paymentDate!: string;

  @IsNumber()
  @Min(0.01)
  totalAmount!: number;

  @IsEnum(['cash', 'check', 'online', 'bank_deposit'])
  paymentMethod!: string;

  @IsOptional()
  @IsString()
  checkNumber?: string;

  @IsOptional()
  @IsDateString()
  checkDate?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OtherCollectionLineDto)
  allocations!: OtherCollectionLineDto[];
}

export class VoidPaymentDto {
  @IsNumber()
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  voidReason!: string;
}
