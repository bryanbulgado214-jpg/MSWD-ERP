import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBankDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  branch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  swiftCode?: string;
}

export class UpdateBankDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  branch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  swiftCode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateBankAccountDto {
  @IsString()
  bankId!: string;

  @IsOptional()
  @IsString()
  fundSourceId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  accountNumber!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  accountName!: string;

  @IsEnum(['checking', 'savings', 'trust'])
  accountType!: 'checking' | 'savings' | 'trust';

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateBankAccountDto {
  @IsInt()
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  accountName?: string;

  @IsOptional()
  @IsString()
  fundSourceId?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsEnum(['active', 'inactive', 'closed'])
  status?: 'active' | 'inactive' | 'closed';
}
