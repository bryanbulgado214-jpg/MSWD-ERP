import { IsArray, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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

export class VoidPaymentDto {
  @IsNumber()
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  voidReason!: string;
}
