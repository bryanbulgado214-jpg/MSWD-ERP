import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAllowanceTypeDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsBoolean() @IsOptional() isTaxable?: boolean;
  @IsBoolean() @IsOptional() isFixed?: boolean;
  @IsNumber() @IsOptional() defaultAmount?: number;
}

export class UpdateAllowanceTypeDto {
  @IsString() @IsOptional() name?: string;
  @IsBoolean() @IsOptional() isTaxable?: boolean;
  @IsBoolean() @IsOptional() isFixed?: boolean;
  @IsNumber() @IsOptional() defaultAmount?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class CreateDeductionTypeDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsOptional() category?: string;
  @IsBoolean() @IsOptional() isPercentage?: boolean;
  @IsNumber() @IsOptional() employerShare?: number;
  @IsNumber() @IsOptional() employeeShare?: number;
}

export class UpdateDeductionTypeDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() category?: string;
  @IsBoolean() @IsOptional() isPercentage?: boolean;
  @IsNumber() @IsOptional() employerShare?: number;
  @IsNumber() @IsOptional() employeeShare?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class CreateEmployeeAllowanceDto {
  @IsString() @IsNotEmpty() employeeId!: string;
  @IsString() @IsNotEmpty() allowanceTypeId!: string;
  @IsNumber() @IsNotEmpty() amount!: number;
  @IsString() @IsNotEmpty() effectiveDate!: string;
  @IsString() @IsOptional() endDate?: string;
}

export class UpdateEmployeeAllowanceDto {
  @IsNumber() @IsOptional() amount?: number;
  @IsString() @IsOptional() endDate?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class CreateEmployeeDeductionDto {
  @IsString() @IsNotEmpty() employeeId!: string;
  @IsString() @IsNotEmpty() deductionTypeId!: string;
  @IsNumber() @IsOptional() amount?: number;
  @IsString() @IsOptional() startDate?: string;
  @IsString() @IsOptional() endDate?: string;
  @IsNumber() @IsOptional() remainingBalance?: number;
  @IsString() @IsOptional() remarks?: string;
}

export class UpdateEmployeeDeductionDto {
  @IsNumber() @IsOptional() amount?: number;
  @IsString() @IsOptional() endDate?: string;
  @IsNumber() @IsOptional() remainingBalance?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsString() @IsOptional() remarks?: string;
}
