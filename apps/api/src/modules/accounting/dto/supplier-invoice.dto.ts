import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class InvoiceLineDto {
  @IsString()
  chartOfAccountId!: string;

  @IsNumber()
  @Min(0)
  debitAmount!: number;

  @IsNumber()
  @Min(0)
  creditAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class DueScheduleItemDto {
  @IsDateString()
  dueDate!: string;

  @IsNumber()
  @Min(0)
  amount!: number;
}

export class CreateSupplierInvoiceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  invoiceNumber!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  supplierName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  supplierTin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  supplierAddress?: string;

  @IsDateString()
  invoiceDate!: string;

  // Optional credit terms, free text (e.g. "3/10, n/15").
  @IsOptional()
  @IsString()
  @MaxLength(60)
  term?: string;

  @IsString()
  @MinLength(1)
  particulars!: string;

  // The charge/deduction side of the entry (debits and any non-cash credits such
  // as withholding tax). The balancing Accounts Payable credit is added by the
  // service for the net amount.
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];

  // One entry for a single due date, several for installments. Optional.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DueScheduleItemDto)
  dueSchedule?: DueScheduleItemDto[];
}
