import { UserRole } from '../../users/entities/user.entity';
import { Permission } from '../../users/entities/role.entity';
export declare class CreateStaffDto {
    firstName: string;
    lastName: string;
    email: string;
    role: UserRole;
}
export declare class UpdateStaffRoleDto {
    role: UserRole;
}
export declare class UpdateStaffPermissionsDto {
    permissions: Permission[];
}
export declare class TogglePermissionDto {
    permission: Permission;
    granted: boolean;
}
export declare class ListStaffQueryDto {
    page?: number;
    limit?: number;
    search?: string;
    role?: UserRole;
    withDeleted?: boolean;
    suspendedOnly?: boolean;
}
