import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateWorkOrderDto {
  @IsString() @IsNotEmpty() type!: string;
  @IsString() @IsOptional() priority?: string;
  @IsString() @IsNotEmpty() title!: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() consumerId?: string;
  @IsString() @IsOptional() meterId?: string;
  @IsString() @IsOptional() location?: string;
  @IsString() @IsOptional() scheduledDate?: string;
  @IsString() @IsOptional() assignedTo?: string;
  @IsNumber() @IsOptional() estimatedDurationHrs?: number;
}

export class UpdateWorkOrderDto {
  @IsNumber() @IsNotEmpty() expectedVersion!: number;
  @IsString() @IsOptional() priority?: string;
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() consumerId?: string;
  @IsString() @IsOptional() meterId?: string;
  @IsString() @IsOptional() location?: string;
  @IsString() @IsOptional() scheduledDate?: string;
  @IsNumber() @IsOptional() estimatedDurationHrs?: number;
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
