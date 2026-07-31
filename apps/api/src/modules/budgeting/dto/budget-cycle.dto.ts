import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateBudgetCycleDto {
  @IsUUID()
  fiscalYearId!: string;

  @IsString()
  @MaxLength(20)
  code!: string;

  @IsString()
  @MaxLength(150)
  name!: string;
}

export class UpdateBudgetCycleDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsIn(['planning', 'active', 'closed'])
  status?: 'planning' | 'active' | 'closed';
}
