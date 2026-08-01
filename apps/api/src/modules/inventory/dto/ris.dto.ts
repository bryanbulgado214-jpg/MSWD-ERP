import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class RisItemDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsNumber()
  quantityRequested!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class CreateRisDto {
  @IsDateString()
  risDate!: string;

  @IsUUID()
  requestingDepartmentId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  purpose?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RisItemDto)
  items!: RisItemDto[];
}

export class ApproveRisDto {
  @IsNumber()
  expectedVersion!: number;
}

export class IssueRisItemDto {
  @IsUUID()
  risItemId!: string;

  @IsNumber()
  quantityIssued!: number;
}

export class IssueRisDto {
  @IsNumber()
  expectedVersion!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IssueRisItemDto)
  items!: IssueRisItemDto[];
}
