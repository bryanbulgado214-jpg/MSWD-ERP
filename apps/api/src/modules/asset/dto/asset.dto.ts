import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/* ── Asset Category ── */

export class CreateAssetCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsEnum(['straight_line'])
  @IsOptional()
  depreciationMethod?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  defaultUsefulLife?: number;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  ppeAccountCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  accumDeprAccountCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  deprExpenseAccountCode?: string;
}

export class UpdateAssetCategoryDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsEnum(['straight_line'])
  @IsOptional()
  depreciationMethod?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  defaultUsefulLife?: number;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  ppeAccountCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  accumDeprAccountCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  deprExpenseAccountCode?: string;

  @IsOptional()
  isActive?: boolean;
}

/* ── Depreciation Run ── */

export class CreateDepreciationRunDto {
  @IsInt()
  @Min(1)
  periodMonth!: number;

  @IsInt()
  @Min(2020)
  periodYear!: number;
}

export class PostDepreciationRunDto {
  @IsInt()
  @Min(1)
  version!: number;
}

export class VoidDepreciationRunDto {
  @IsInt()
  @Min(1)
  version!: number;
}

/* ── Asset Transfer ── */

export class CreateAssetTransferDto {
  @IsUUID()
  propertyRecordId!: string;

  @IsUUID()
  toUserId!: string;

  @IsUUID()
  @IsOptional()
  toLocationId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  reason?: string;
}

export class ApproveAssetTransferDto {
  @IsInt()
  @Min(1)
  version!: number;
}

export class RejectAssetTransferDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  reason?: string;
}

export class CompleteAssetTransferDto {
  @IsInt()
  @Min(1)
  version!: number;
}

/* ── Assign Category ── */

export class AssignCategoryDto {
  @IsUUID()
  assetCategoryId!: string;
}
