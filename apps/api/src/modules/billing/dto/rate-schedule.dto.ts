import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RateTierDto {
  @IsNumber() minConsumption!: number;
  @IsNumber() @IsOptional() maxConsumption?: number | null;
  @IsNumber() ratePerCubicMeter!: number;
  @IsNumber() @IsOptional() sortOrder?: number;
}

export class CreateRateScheduleDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() consumerType!: string;
  @IsString() @IsNotEmpty() effectiveDate!: string;
  @IsString() @IsOptional() endDate?: string;
  @IsNumber() minimumCharge!: number;
  @IsNumber() @IsOptional() minimumConsumption?: number;
  @IsNumber() @IsOptional() environmentalFee?: number;
  @IsNumber() @IsOptional() sewerCharge?: number;
  @IsNumber() @IsOptional() maintenanceFee?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => RateTierDto)
  tiers!: RateTierDto[];
}

export class UpdateRateScheduleDto {
  @IsNumber() @IsNotEmpty() expectedVersion!: number;
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() effectiveDate?: string;
  @IsString() @IsOptional() endDate?: string | null;
  @IsNumber() @IsOptional() minimumCharge?: number;
  @IsNumber() @IsOptional() minimumConsumption?: number;
  @IsNumber() @IsOptional() environmentalFee?: number;
  @IsNumber() @IsOptional() sewerCharge?: number;
  @IsNumber() @IsOptional() maintenanceFee?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsArray() @IsOptional() @ValidateNested({ each: true }) @Type(() => RateTierDto)
  tiers?: RateTierDto[];
}
