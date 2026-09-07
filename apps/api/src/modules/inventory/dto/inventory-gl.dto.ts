import { IsInt, Max, Min } from 'class-validator';

export class PostInventoryGlDto {
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}

export class VoidInventoryGlDto {
  @IsInt()
  expectedVersion!: number;
}
