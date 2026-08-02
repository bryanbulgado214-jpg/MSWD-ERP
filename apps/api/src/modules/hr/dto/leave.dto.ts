import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateLeaveApplicationDto {
  @IsString() @IsNotEmpty() employeeId!: string;
  @IsString() @IsNotEmpty() leaveTypeId!: string;
  @IsString() @IsNotEmpty() startDate!: string;
  @IsString() @IsNotEmpty() endDate!: string;
  @IsNumber() @IsNotEmpty() daysApplied!: number;
  @IsString() @IsOptional() reason?: string;
}

export class ApproveLeaveDto {
  @IsInt() @IsNotEmpty() expectedVersion!: number;
}

export class RejectLeaveDto {
  @IsInt() @IsNotEmpty() expectedVersion!: number;
  @IsString() @IsNotEmpty() rejectionReason!: string;
}

export class CancelLeaveDto {
  @IsInt() @IsNotEmpty() expectedVersion!: number;
}

export class InitLeaveBalancesDto {
  @IsString() @IsNotEmpty() employeeId!: string;
  @IsInt() @IsNotEmpty() year!: number;
}
