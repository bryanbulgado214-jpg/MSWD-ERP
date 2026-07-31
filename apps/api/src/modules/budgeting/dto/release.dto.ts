import { IsDateString, IsNumber, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateReleaseDto {
  @IsUUID()
  budgetHeaderId!: string;

  @IsString()
  @MaxLength(30)
  releaseNumber!: string;

  @IsDateString()
  releaseDate!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  releasedAmount!: number;
}
