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

export class LoanScheduleLineDto {
  @IsNumber()
  @Min(1)
  seq!: number;

  @IsDateString()
  dueDate!: string;

  @IsNumber()
  beginningBalance!: number;

  @IsNumber()
  @Min(0)
  payment!: number;

  @IsNumber()
  @Min(0)
  interest!: number;

  @IsNumber()
  @Min(0)
  principal!: number;

  @IsNumber()
  endingBalance!: number;
}

export class CreateLoanDto {
  @IsIn(['new', 'existing'])
  loanType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsNumber()
  @Min(0.01)
  principal!: number;

  @IsString()
  loansPayableAccountId!: string;

  @IsString()
  interestExpenseAccountId!: string;

  @IsString()
  bankAccountId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;

  // ── New-loan terms (the schedule is computed from these) ──
  @IsOptional()
  @IsNumber()
  @Min(0)
  annualRatePct?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  termPeriods?: number; // total number of payments

  @IsOptional()
  @IsIn(['monthly', 'quarterly', 'semiannual', 'annual'])
  frequency?: string;

  @IsOptional()
  @IsIn(['annuity', 'straight'])
  method?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string; // drawdown / proceeds date

  @IsOptional()
  @IsDateString()
  firstPaymentDate?: string;

  // ── Existing-loan uploaded schedule ──
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LoanScheduleLineDto)
  schedule?: LoanScheduleLineDto[];
}

export class MarkAmortizationPaidDto {
  @IsBoolean()
  paid!: boolean;
}

export class CreateLoanDvDto {
  @IsOptional()
  @IsDateString()
  dvDate?: string; // defaults to the amortization due date
}
