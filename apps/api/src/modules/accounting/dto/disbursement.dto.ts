import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AddDvNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

// Accounting-created DVs are non-procurement; procurement DVs originate from the
// PR -> PO -> ORS chain in the procurement module.
export const NON_PROCUREMENT_DV_TYPES = [
  'travel',
  'reimbursement',
  'payroll',
  'utility',
  'other',
] as const;

export class DisbursementLineDto {
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

export class CreateDisbursementDto {
  @IsIn(NON_PROCUREMENT_DV_TYPES as unknown as string[])
  dvType!: string;

  @IsDateString()
  dvDate!: string;

  /** Manual DV number (used when the org has manual document numbering on). */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  dvNumber?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  payeeName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  payeeTin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  payeeAddress?: string;

  @IsString()
  @MinLength(1)
  particulars!: string;

  @IsOptional()
  @IsIn(['check', 'ada', 'others'])
  paymentMode?: string;

  // The paying bank account. Its linked Cash-in-Bank ledger account is credited
  // automatically for the net amount — the caller does NOT supply the cash line.
  @IsString()
  bankAccountId!: string;

  @IsOptional()
  @IsString()
  fundSourceId?: string;

  // Save without posting to the general ledger. The accounting entry is held as
  // a draft JEV until the DV is posted.
  @IsOptional()
  @IsBoolean()
  asDraft?: boolean;

  // The charge/deduction side of the entry (debits and any non-cash credits such
  // as withholding tax). The balancing cash credit is added from the bank account.
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DisbursementLineDto)
  lines!: DisbursementLineDto[];
}
