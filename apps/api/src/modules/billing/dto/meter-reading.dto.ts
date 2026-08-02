import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateMeterReadingDto {
  @IsUUID()
  consumerId!: string;

  @IsUUID()
  meterId!: string;

  @IsUUID()
  billingPeriodId!: string;

  @IsDateString()
  readingDate!: string;

  @IsNumber()
  @Min(0)
  previousReading!: number;

  @IsNumber()
  @Min(0)
  currentReading!: number;

  @IsString()
  @IsOptional()
  remarks?: string;
}

export class UpdateMeterReadingDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  currentReading?: number;

  @IsDateString()
  @IsOptional()
  readingDate?: string;

  @IsString()
  @IsOptional()
  remarks?: string;

  @IsString()
  @IsOptional()
  status?: string;
}
