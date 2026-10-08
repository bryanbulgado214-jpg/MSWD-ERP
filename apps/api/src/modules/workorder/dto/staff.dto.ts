import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const STAFF_STATUSES = ['available', 'on_field', 'on_leave', 'unavailable'] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export class CreateStaffDto {
  @IsString() @IsNotEmpty() @MaxLength(255) name!: string;
  @IsString() @IsOptional() @MaxLength(150) designation?: string;
  @IsString() @IsOptional() @MaxLength(150) department?: string;
  @IsString() @IsOptional() @MaxLength(50) contactNumber?: string;
  @IsBoolean() @IsOptional() isFieldPersonnel?: boolean;
  // Optional link to a work-order crew roster entry (field personnel only).
  @IsUUID() @IsOptional() workOrderPersonnelId?: string;
}

export class UpdateStaffDto {
  @IsString() @IsOptional() @MaxLength(255) name?: string;
  @IsString() @IsOptional() @MaxLength(150) designation?: string;
  @IsString() @IsOptional() @MaxLength(150) department?: string;
  @IsString() @IsOptional() @MaxLength(50) contactNumber?: string;
  @IsBoolean() @IsOptional() isFieldPersonnel?: boolean;
  @IsBoolean() @IsOptional() isActive?: boolean;
  // A UUID links to that personnel; an empty string clears the link.
  @IsString() @IsOptional() @MaxLength(40) workOrderPersonnelId?: string;
}

export class SetStaffStatusDto {
  @IsIn(STAFF_STATUSES as unknown as string[]) status!: StaffStatus;
  @IsString() @IsOptional() @MaxLength(255) statusNote?: string;
}
