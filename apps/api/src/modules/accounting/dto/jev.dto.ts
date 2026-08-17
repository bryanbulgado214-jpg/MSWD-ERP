import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class JevLineDto {
  @IsString()
  chartOfAccountId!: string;

  @IsNumber()
  @Min(0)
  debitAmount!: number;

  @IsNumber()
  @Min(0)
  creditAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateJevDto {
  @IsDateString()
  jevDate!: string;

  @IsString()
  @MinLength(1)
  particulars!: string;

  /** Manual JEV number (used when the org has manual document numbering on). */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  jevNumber?: string;

  @IsOptional()
  @IsString()
  responsibilityCenterId?: string;

  @IsOptional()
  @IsString()
  fundSourceId?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JevLineDto)
  lines!: JevLineDto[];
}

export class UpdateJevDto {
  @IsInt()
  expectedVersion!: number;

  @IsOptional()
  @IsDateString()
  jevDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  particulars?: string;

  @IsOptional()
  @IsString()
  responsibilityCenterId?: string;

  @IsOptional()
  @IsString()
  fundSourceId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JevLineDto)
  lines?: JevLineDto[];
}

export class PostJevDto {
  @IsInt()
  expectedVersion!: number;
}

export class VoidJevDto {
  @IsInt()
  expectedVersion!: number;

  @IsString()
  @MinLength(1)
  voidReason!: string;
}

export class ReverseJevDto {
  @IsInt()
  expectedVersion!: number;

  @IsOptional()
  @IsDateString()
  reversalDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
