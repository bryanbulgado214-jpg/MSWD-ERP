import { IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class CreateDelegationDto {
  @IsUUID()
  delegateUserId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  permissionCode!: string;

  @IsDateString()
  effectiveDate!: string;

  @IsDateString()
  expirationDate!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountLimit?: number;

  @IsOptional()
  @IsUUID()
  scopeDepartmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class RevokeDelegationDto {
  @IsInt()
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}
