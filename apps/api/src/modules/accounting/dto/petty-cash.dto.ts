import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePettyCashFundDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  imprestAmount!: number;

  @IsUUID()
  pettyCashAccountId!: string;

  @IsUUID()
  cashInBankAccountId!: string;

  @IsOptional()
  @IsUUID()
  custodianUserId?: string;
}

export class UpdatePettyCashFundDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  imprestAmount?: number;

  @IsOptional()
  @IsUUID()
  pettyCashAccountId?: string;

  @IsOptional()
  @IsUUID()
  cashInBankAccountId?: string;

  @IsOptional()
  @IsUUID()
  custodianUserId?: string;

  @IsOptional()
  @IsEnum(['active', 'closed'] as const)
  status?: 'active' | 'closed';
}

export class CreatePettyCashVoucherDto {
  @IsUUID()
  fundId!: string;

  @IsDateString()
  pcvDate!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  payeeName!: string;

  @IsString()
  @MinLength(1)
  particulars!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  // Optional at creation — the accountant assigns the expense account at
  // replenishment review.
  @IsOptional()
  @IsUUID()
  chargeAccountId?: string;
}

export class SetChargeAccountDto {
  @IsUUID()
  chargeAccountId!: string;
}

export class UpdatePettyCashVoucherDto {
  @IsOptional()
  @IsDateString()
  pcvDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  payeeName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  particulars?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsUUID()
  chargeAccountId?: string;
}

export class PrepareReplenishmentDto {
  @IsUUID()
  fundId!: string;

  @IsDateString()
  replDate!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  voucherIds!: string[];
}
