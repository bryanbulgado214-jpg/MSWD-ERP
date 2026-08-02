import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateConsumerDto {
  @IsString() @IsNotEmpty() accountNumber!: string;
  @IsString() @IsNotEmpty() firstName!: string;
  @IsString() @IsOptional() middleName?: string;
  @IsString() @IsNotEmpty() lastName!: string;
  @IsString() @IsOptional() businessName?: string;
  @IsString() @IsOptional() consumerType?: string;
  @IsString() @IsNotEmpty() address!: string;
  @IsString() @IsOptional() barangay?: string;
  @IsString() @IsOptional() municipality?: string;
  @IsString() @IsOptional() province?: string;
  @IsString() @IsOptional() contactNumber?: string;
  @IsString() @IsOptional() email?: string;
  @IsBoolean() @IsOptional() isSeniorCitizen?: boolean;
  @IsBoolean() @IsOptional() isPwd?: boolean;
  @IsString() @IsOptional() connectionDate?: string;
  @IsString() @IsOptional() notes?: string;
}

export class UpdateConsumerDto {
  @IsNumber() @IsNotEmpty() expectedVersion!: number;
  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() middleName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsString() @IsOptional() businessName?: string;
  @IsString() @IsOptional() address?: string;
  @IsString() @IsOptional() barangay?: string;
  @IsString() @IsOptional() contactNumber?: string;
  @IsString() @IsOptional() email?: string;
  @IsBoolean() @IsOptional() isSeniorCitizen?: boolean;
  @IsBoolean() @IsOptional() isPwd?: boolean;
  @IsString() @IsOptional() status?: string;
  @IsString() @IsOptional() notes?: string;
}

export class AssignMeterDto {
  @IsString() @IsNotEmpty() meterId!: string;
  @IsString() @IsNotEmpty() installedDate!: string;
  @IsString() @IsOptional() remarks?: string;
}
