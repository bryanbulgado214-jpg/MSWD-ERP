import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreatePayeeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  tin?: string;
}

export class UpdatePayeeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  tin?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class MergePayeeDto {
  // The surviving payee. The :id in the route is the one being absorbed.
  @IsUUID()
  targetId!: string;
}
