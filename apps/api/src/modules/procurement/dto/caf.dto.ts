import { IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateCafDto {
  @IsUUID()
  purchaseRequestId!: string;

  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @IsUUID()
  budgetReleaseId!: string;

  @IsOptional()
  @IsUUID()
  budgetReservationId?: string;

  @IsOptional()
  @IsUUID()
  budgetLineId?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  certifiedAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  accountCode?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CafActionDto {
  @IsInt()
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}
