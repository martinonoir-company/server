import {
  IsEmail,
  IsString,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../../users/entities/user.entity';

export class CreateStaffDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsEnum([UserRole.COMPANY_SUPER_ADMIN, UserRole.COMPANY_STAFF], {
    message: 'Role must be COMPANY_SUPER_ADMIN or COMPANY_STAFF',
  })
  role!: UserRole;
}

export class UpdateStaffRoleDto {
  @IsEnum([UserRole.COMPANY_SUPER_ADMIN, UserRole.COMPANY_STAFF], {
    message: 'Role must be COMPANY_SUPER_ADMIN or COMPANY_STAFF',
  })
  role!: UserRole;
}

export class ListStaffQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
