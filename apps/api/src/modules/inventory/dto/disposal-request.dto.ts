import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

export class DisposalItemDto {
  @IsUUID()
  propertyRecordId!: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsNumber()
  quantity!: number;

  @IsString()
  @MaxLength(30)
  unitOfMeasure!: string;

  @IsEnum(['brand_new', 'serviceable', 'unserviceable', 'poor', 'beyond_repair'])
  condition!: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateDisposalRequestDto {
  @IsDateString()
  requestDate!: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DisposalItemDto)
  items!: DisposalItemDto[];
}

export class AppraiseDisposalItemDto {
  @IsUUID()
  disposalItemId!: string;

  @IsNumber()
  appraisedValue!: number;
}

export class AppraiseDisposalDto {
  @IsInt()
  expectedVersion!: number;

  @IsOptional()
  @IsEnum(['public_auction', 'negotiated_sale', 'barter', 'donation', 'destruction', 'transfer_to_agency'])
  disposalMethod?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AppraiseDisposalItemDto)
  items!: AppraiseDisposalItemDto[];
}

export class ApproveDisposalDto {
  @IsInt()
  expectedVersion!: number;
}
