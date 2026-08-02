import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateCheckDto {
  @IsUUID()
  bankAccountId!: string;

  @IsString()
  @IsNotEmpty()
  checkNumber!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsDateString()
  checkDate!: string;

  @IsString()
  @IsNotEmpty()
  payeeName!: string;

  @IsUUID()
  @IsOptional()
  disbursementVoucherId?: string;
}

export class TransitionCheckDto {
  @IsNumber()
  expectedVersion!: number;

  @IsString()
  @IsIn(['printed', 'released', 'cleared', 'stale_dated', 'spoiled', 'voided'])
  toStatus!: string;

  @IsString()
  @IsOptional()
  remarks?: string;

  @IsDateString()
  @IsOptional()
  clearedDate?: string;
}
