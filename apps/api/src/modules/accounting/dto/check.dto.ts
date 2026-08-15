import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

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

export class PrintCheckDto {
  @IsString()
  @IsNotEmpty()
  checkNumber!: string;

  @IsDateString()
  @IsOptional()
  checkDate?: string;
}

export class TransitionCheckDto {
  @IsNumber()
  expectedVersion!: number;

  // Forward lifecycle only — void/spoil go through the void endpoint.
  @IsString()
  @IsIn(['released', 'cleared', 'stale_dated'])
  toStatus!: string;

  @IsString()
  @IsOptional()
  remarks?: string;

  @IsDateString()
  @IsOptional()
  clearedDate?: string;
}

export class VoidCheckDto {
  @IsNumber()
  expectedVersion!: number;

  @IsString()
  @IsIn(['voided', 'spoiled'])
  toStatus!: string;

  @IsString()
  @IsNotEmpty()
  remarks!: string;
}
