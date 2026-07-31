import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class CreateBudgetHeaderDto {
  @IsUUID()
  budgetVersionId!: string;

  @IsUUID()
  responsibilityCenterId!: string;

  @IsUUID()
  fundSourceId!: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currencyCode?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalAmount!: number;
}

export class UpdateBudgetHeaderDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalAmount?: number;

  @IsOptional()
  @IsIn(['draft', 'submitted', 'approved', 'rejected'])
  status?: 'draft' | 'submitted' | 'approved' | 'rejected';
}

const SORTABLE_FIELDS = ['totalAmount', 'status', 'createdAt', 'updatedAt'] as const;
export type BudgetHeaderSortField = (typeof SORTABLE_FIELDS)[number];

/** Query params for GET /budgeting/budget-headers — search, filters,
 * pagination, and sorting, all optional (sensible defaults applied in
 * BudgetHeaderService.findAllPaginated). `@Type(() => Number)` is
 * required because query-string values always arrive as strings; the
 * global ValidationPipe's `transform: true` (already configured in
 * main.ts) uses it to coerce them before validation runs. */
export class ListBudgetHeadersQueryDto {
  @IsOptional()
  @IsUUID()
  budgetVersionId?: string;

  @IsOptional()
  @IsUUID()
  responsibilityCenterId?: string;

  @IsOptional()
  @IsUUID()
  fundSourceId?: string;

  @IsOptional()
  @IsIn(['draft', 'submitted', 'approved', 'rejected'])
  status?: 'draft' | 'submitted' | 'approved' | 'rejected';

  /** Free-text search, matched against the responsibility center's and
   * fund source's names (case-insensitive, substring match). */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsIn(SORTABLE_FIELDS)
  sortBy?: BudgetHeaderSortField = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
