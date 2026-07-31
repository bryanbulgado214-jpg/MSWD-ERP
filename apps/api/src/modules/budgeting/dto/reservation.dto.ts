import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateReservationDto {
  @IsUUID()
  budgetReleaseId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  reservationAmount!: number;

  @IsOptional()
  @IsString()
  subjectTable?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;
}

export class EditReservationDraftDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  reservationAmount?: number;

  @IsOptional()
  @IsString()
  subjectTable?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;
}

/** Separate real class (not a TS-only intersection type) so
 * class-validator's decorators on `expectedVersion` actually apply —
 * `SomeDto & { expectedVersion: number }` would carry no validation
 * metadata for that field at runtime. */
export class UpdateReservationDraftDto extends EditReservationDraftDto {
  @IsInt()
  expectedVersion!: number;
}

/** Every state-transition endpoint (submit/approve/reject/cancel) needs
 * the caller's last-known `version` for optimistic-concurrency
 * conflict detection — see ReservationService. */
export class ReservationActionDto {
  @IsInt()
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}
