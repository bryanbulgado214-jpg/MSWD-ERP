import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const BUDGET_UTILIZATION_SECTIONS = [
  'personnel_services',
  'mooe',
  'capital_outlay',
] as const;
export type BudgetUtilizationSectionValue = (typeof BUDGET_UTILIZATION_SECTIONS)[number];

export class CreateBudgetUtilizationLineDto {
  @IsUUID() fiscalYearId!: string;
  @IsIn(BUDGET_UTILIZATION_SECTIONS) section!: BudgetUtilizationSectionValue;
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsNumber() @IsOptional() budgetAmount?: number;
  @IsInt() @IsOptional() sortOrder?: number;
  @IsBoolean() @IsOptional() appCrossCheck?: boolean;
}

export class UpdateBudgetUtilizationLineDto {
  @IsInt() @IsNotEmpty() expectedVersion!: number;
  @IsIn(BUDGET_UTILIZATION_SECTIONS) @IsOptional() section?: BudgetUtilizationSectionValue;
  @IsString() @IsNotEmpty() @MaxLength(200) @IsOptional() name?: string;
  @IsNumber() @IsOptional() budgetAmount?: number;
  @IsInt() @IsOptional() sortOrder?: number;
  @IsBoolean() @IsOptional() appCrossCheck?: boolean;
}

export class SetUtilizationAccountsDto {
  @IsArray() @IsUUID('all', { each: true }) accountIds!: string[];
}

export class SeedUtilizationLinesDto {
  @IsUUID() fiscalYearId!: string;
}
