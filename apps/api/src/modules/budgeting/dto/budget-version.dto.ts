import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateBudgetVersionDto {
  @IsUUID()
  budgetCycleId!: string;

  @IsInt()
  @Min(1)
  versionNumber!: number;

  @IsString()
  @MaxLength(150)
  name!: string;
}

export class UpdateBudgetVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsIn(['draft', 'submitted', 'approved', 'superseded', 'rejected'])
  status?: 'draft' | 'submitted' | 'approved' | 'superseded' | 'rejected';

  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}
