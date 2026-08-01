import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class AccountabilityItemDto {
  @IsUUID()
  propertyRecordId!: string;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  unitCost!: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateAccountabilityRecordDto {
  @IsEnum(['par', 'ics'])
  accountabilityType!: 'par' | 'ics';

  @IsUUID()
  issuedToUserId!: string;

  @IsDateString()
  issuedDate!: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AccountabilityItemDto)
  items!: AccountabilityItemDto[];
}

export class ReturnAccountabilityDto {
  @IsInt()
  expectedVersion!: number;

  @IsDateString()
  returnDate!: string;
}

export class TransferAccountabilityDto {
  @IsInt()
  expectedVersion!: number;

  @IsUUID()
  newUserId!: string;
}
