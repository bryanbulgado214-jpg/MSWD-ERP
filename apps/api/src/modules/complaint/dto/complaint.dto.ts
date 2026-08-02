import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateComplaintDto {
  @IsEnum(['water_quality', 'billing_dispute', 'service_interruption', 'leak_report', 'meter_issue', 'low_pressure', 'no_water', 'illegal_connection', 'staff_conduct', 'other'])
  type!: string;

  @IsOptional()
  @IsEnum(['low', 'normal', 'high', 'urgent'])
  priority?: string;

  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  consumerId?: string;
}

export class UpdateComplaintDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsEnum(['low', 'normal', 'high', 'urgent'])
  priority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  consumerId?: string;
}

export class AssignComplaintDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  assignedTo!: string;
}

export class ResolveComplaintDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsEnum(['fixed', 'explained', 'referred', 'no_action_needed', 'duplicate', 'invalid'])
  resolutionType!: string;

  @IsOptional()
  @IsString()
  resolutionNotes?: string;
}

export class CloseComplaintDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ReopenComplaintDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class AddComplaintNoteDto {
  @IsString()
  note!: string;

  @IsOptional()
  isInternal?: boolean;
}

export class LinkWorkOrderDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  workOrderId!: string;
}
