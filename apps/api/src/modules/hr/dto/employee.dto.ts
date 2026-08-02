import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateEmployeeDto {
  @IsString() @IsNotEmpty() employeeNumber!: string;
  @IsString() @IsNotEmpty() firstName!: string;
  @IsString() @IsOptional() middleName?: string;
  @IsString() @IsNotEmpty() lastName!: string;
  @IsString() @IsOptional() suffix?: string;
  @IsString() @IsOptional() dateOfBirth?: string;
  @IsString() @IsOptional() gender?: string;
  @IsString() @IsOptional() civilStatus?: string;
  @IsString() @IsOptional() address?: string;
  @IsString() @IsOptional() contactNumber?: string;
  @IsString() @IsOptional() email?: string;
  @IsString() @IsOptional() tin?: string;
  @IsString() @IsOptional() sssGsisNumber?: string;
  @IsString() @IsOptional() philhealthNumber?: string;
  @IsString() @IsOptional() pagibigNumber?: string;
  @IsString() @IsOptional() departmentId?: string;
  @IsString() @IsOptional() positionId?: string;
  @IsString() @IsOptional() userId?: string;
  @IsString() @IsOptional() employmentType?: string;
  @IsString() @IsOptional() employmentStatus?: string;
  @IsString() @IsOptional() dateHired?: string;
  @IsString() @IsOptional() dateRegularized?: string;
  @IsNumber() @IsOptional() basicSalary?: number;
  @IsNumber() @IsOptional() salaryGrade?: number;
  @IsNumber() @IsOptional() salaryStep?: number;
}

export class UpdateEmployeeDto {
  @IsNumber() @IsNotEmpty() expectedVersion!: number;
  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() middleName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsString() @IsOptional() suffix?: string;
  @IsString() @IsOptional() dateOfBirth?: string;
  @IsString() @IsOptional() gender?: string;
  @IsString() @IsOptional() civilStatus?: string;
  @IsString() @IsOptional() address?: string;
  @IsString() @IsOptional() contactNumber?: string;
  @IsString() @IsOptional() email?: string;
  @IsString() @IsOptional() tin?: string;
  @IsString() @IsOptional() sssGsisNumber?: string;
  @IsString() @IsOptional() philhealthNumber?: string;
  @IsString() @IsOptional() pagibigNumber?: string;
  @IsString() @IsOptional() departmentId?: string;
  @IsString() @IsOptional() positionId?: string;
  @IsString() @IsOptional() userId?: string;
  @IsString() @IsOptional() employmentType?: string;
  @IsString() @IsOptional() employmentStatus?: string;
  @IsString() @IsOptional() dateHired?: string;
  @IsString() @IsOptional() dateRegularized?: string;
  @IsString() @IsOptional() dateSeparated?: string;
  @IsString() @IsOptional() separationReason?: string;
  @IsNumber() @IsOptional() basicSalary?: number;
  @IsNumber() @IsOptional() salaryGrade?: number;
  @IsNumber() @IsOptional() salaryStep?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class CreatePositionDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() title!: string;
  @IsNumber() @IsOptional() salaryGrade?: number;
  @IsNumber() @IsOptional() salaryStep?: number;
}

export class UpdatePositionDto {
  @IsString() @IsOptional() title?: string;
  @IsNumber() @IsOptional() salaryGrade?: number;
  @IsNumber() @IsOptional() salaryStep?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
