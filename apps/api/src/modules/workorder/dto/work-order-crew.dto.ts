import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const NATURES = ['technical', 'commercial'] as const;

export class CreatePersonnelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  designation?: string;

  @IsOptional()
  @IsIn(NATURES)
  section?: 'technical' | 'commercial';

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactNumber?: string;
}

export class UpdatePersonnelDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  designation?: string;

  @IsOptional()
  @IsIn(NATURES)
  section?: 'technical' | 'commercial';

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactNumber?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateTeamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsIn(NATURES)
  section?: 'technical' | 'commercial';

  @IsOptional()
  @IsUUID()
  leaderId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  memberIds?: string[];
}

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsIn(NATURES)
  section?: 'technical' | 'commercial';

  @IsOptional()
  @IsUUID()
  leaderId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  memberIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
