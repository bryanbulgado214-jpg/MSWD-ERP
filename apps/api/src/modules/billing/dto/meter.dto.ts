import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateMeterDto {
  @IsString() @IsNotEmpty() serialNumber!: string;
  @IsString() @IsOptional() brand?: string;
  @IsString() @IsOptional() size?: string;
  @IsNumber() @IsOptional() initialReading?: number;
  @IsString() @IsOptional() notes?: string;
}

export class UpdateMeterDto {
  @IsString() @IsOptional() brand?: string;
  @IsString() @IsOptional() status?: string;
  @IsString() @IsOptional() notes?: string;
}
