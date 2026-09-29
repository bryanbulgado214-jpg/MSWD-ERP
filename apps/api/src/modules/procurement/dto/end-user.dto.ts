import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEndUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsUUID()
  departmentId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  position?: string;
}

export class UpdateEndUserDto {
  @IsInt()
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  position?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
