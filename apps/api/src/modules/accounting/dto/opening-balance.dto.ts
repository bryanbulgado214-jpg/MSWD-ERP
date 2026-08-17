import { IsNotEmpty, IsString } from 'class-validator';

export class PreviewOpeningBalancesDto {
  @IsString()
  @IsNotEmpty()
  csv!: string;
}

export class ImportOpeningBalancesDto {
  @IsString()
  @IsNotEmpty()
  csv!: string;

  /** The effective date of the beginning balances (YYYY-MM-DD). */
  @IsString()
  @IsNotEmpty()
  asOfDate!: string;
}
