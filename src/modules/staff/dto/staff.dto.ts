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
  IsArray,
  ArrayUnique,
  IsBoolean,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { UserRole } from '../../users/entities/user.entity';
import { Permission } from '../../users/entities/role.entity';

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

/**
 * Full replacement of a staff member's per-user permission override.
 * Passing an empty array = no permissions. Passing every enum value = all.
 * Any permission outside the Permission enum is rejected.
 */
export class UpdateStaffPermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsEnum(Permission, { each: true, message: 'Unknown permission in list' })
  permissions!: Permission[];
}

/** Toggle a single permission flag on or off. */
export class TogglePermissionDto {
  @IsEnum(Permission, { message: 'Unknown permission' })
  permission!: Permission;

  @IsBoolean()
  granted!: boolean;
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

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  withDeleted?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  suspendedOnly?: boolean;
}
