import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsString, Max, Min } from 'class-validator';

export class CreateFiscalYearDto {
  @IsInt()
  @Min(2020)
  @Max(2099)
  year!: number;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}

export class PeriodActionDto {
  @IsNumber()
  expectedVersion!: number;
}
