import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateDisconnectionOrderDto {
  @IsUUID()
  @IsNotEmpty()
  consumerId!: string;

  @IsDateString()
  @IsNotEmpty()
  noticeDate!: string;

  @IsDateString()
  @IsNotEmpty()
  scheduledDate!: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class TransitionDisconnectionDto {
  @IsNumber()
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  action!: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reconnectionFee?: number;
}
