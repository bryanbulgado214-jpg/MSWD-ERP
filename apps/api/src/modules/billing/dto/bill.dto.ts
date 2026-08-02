import { IsOptional, IsString, IsUUID } from 'class-validator';

export class GenerateBillsDto {
  @IsUUID()
  billingPeriodId!: string;
}

export class AdjustBillDto {
  @IsString()
  @IsOptional()
  notes?: string;
}
