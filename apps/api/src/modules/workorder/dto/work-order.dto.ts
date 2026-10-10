import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CreateWorkOrderDto {
  @IsString() @IsNotEmpty() type!: string;
  @IsString() @IsOptional() priority?: string;
  @IsString() @IsNotEmpty() title!: string;
  @IsString() @IsOptional() description?: string;
  @IsUUID() @IsOptional() consumerId?: string;
  @IsString() @IsOptional() customerName?: string;
  @IsUUID() @IsOptional() meterId?: string;
  @IsString() @IsOptional() location?: string;
  @IsString() @IsOptional() scheduledDate?: string;
  @IsNumber() @IsOptional() estimatedDurationHrs?: number;
  @IsString() @IsOptional() instructions?: string;
  @IsString() @IsOptional() remarks?: string;
  @IsBoolean() @IsOptional() customerSignatureRequired?: boolean;
  // Optional crew at creation (applied only if the creator may assign for the
  // derived nature).
  @IsBoolean() @IsOptional() soloTask?: boolean;
  @IsUUID() @IsOptional() teamId?: string;
  @IsUUID() @IsOptional() teamLeaderId?: string;
  @IsArray() @IsUUID('all', { each: true }) @IsOptional() memberIds?: string[];
}

export class UpdateWorkOrderDto {
  @IsNumber() @IsNotEmpty() expectedVersion!: number;
  @IsString() @IsOptional() priority?: string;
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() consumerId?: string;
  @IsString() @IsOptional() customerName?: string;
  @IsString() @IsOptional() meterId?: string;
  @IsString() @IsOptional() location?: string;
  @IsString() @IsOptional() scheduledDate?: string;
  @IsNumber() @IsOptional() estimatedDurationHrs?: number;
  @IsString() @IsOptional() instructions?: string;
  @IsString() @IsOptional() remarks?: string;
  @IsBoolean() @IsOptional() customerSignatureRequired?: boolean;
}

// One crew: a leader plus members (or a single person for a one-man task).
export class CrewInputDto {
  @IsBoolean() @IsOptional() soloTask?: boolean;
  @IsUUID() @IsOptional() teamId?: string;
  @IsUUID() teamLeaderId!: string;
  @IsArray() @IsUUID('all', { each: true }) @IsOptional() memberIds?: string[];
}

export class AssignCrewDto {
  @IsNumber() @IsNotEmpty() expectedVersion!: number;
  // One or more crews. The legacy single-crew fields below are still accepted
  // and folded into a one-crew list.
  @IsArray() @ValidateNested({ each: true }) @Type(() => CrewInputDto) @IsOptional() crews?: CrewInputDto[];
  @IsBoolean() @IsOptional() soloTask?: boolean;
  @IsUUID() @IsOptional() teamId?: string;
  @IsUUID() @IsOptional() teamLeaderId?: string;
  @IsArray() @IsUUID('all', { each: true }) @IsOptional() memberIds?: string[];
}

export class DispatchWorkOrderDto {
  @IsNumber() @IsNotEmpty() expectedVersion!: number;
  @IsString() @IsOptional() timeLeft?: string;
}

// Marking one crew back from the field. The resolution fields are accepted when
// this is the last crew to finish (the work order then becomes "completed").
export class CompleteCrewDto {
  @IsNumber() @IsNotEmpty() expectedVersion!: number;
  @IsString() @IsOptional() timeReturned?: string;
  @IsString() @IsOptional() completionNotes?: string;
  @IsNumber() @IsOptional() actualDurationHrs?: number;
  @IsString() @IsOptional() tasksPerformed?: string;
  @IsString() @IsOptional() issuesEncountered?: string;
  @IsString() @IsOptional() remarks?: string;
}

export class AssignWorkOrderDto {
  @IsNumber() @IsNotEmpty() expectedVersion!: number;
  @IsString() @IsNotEmpty() assignedTo!: string;
}

export class StartWorkOrderDto {
  @IsNumber() @IsNotEmpty() expectedVersion!: number;
}

export class CompleteWorkOrderDto {
  @IsNumber() @IsNotEmpty() expectedVersion!: number;
  @IsString() @IsOptional() completionNotes?: string;
  @IsNumber() @IsOptional() actualDurationHrs?: number;
  @IsString() @IsOptional() timeReturned?: string;
  @IsString() @IsOptional() tasksPerformed?: string;
  @IsString() @IsOptional() issuesEncountered?: string;
  @IsString() @IsOptional() remarks?: string;
}

export class VerifyWorkOrderDto {
  @IsNumber() @IsNotEmpty() expectedVersion!: number;
}

export class CancelWorkOrderDto {
  @IsNumber() @IsNotEmpty() expectedVersion!: number;
  @IsString() @IsOptional() reason?: string;
}

export class AddWorkOrderNoteDto {
  @IsString() @IsNotEmpty() note!: string;
}

export class AddWorkOrderMaterialDto {
  @IsString() @IsNotEmpty() inventoryItemId!: string;
  @IsNumber() @IsNotEmpty() quantityUsed!: number;
  @IsNumber() @IsOptional() unitCost?: number;
  @IsString() @IsOptional() notes?: string;
}

export class AddWorkOrderMaterialsBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddWorkOrderMaterialDto)
  materials!: AddWorkOrderMaterialDto[];
}
