import { StaffService } from './staff.service';
import { CreateStaffDto, UpdateStaffRoleDto, UpdateStaffPermissionsDto, TogglePermissionDto, ListStaffQueryDto } from './dto/staff.dto';
import { User } from '../users/entities/user.entity';
export declare class StaffController {
    private readonly staffService;
    constructor(staffService: StaffService);
    listStaff(query: ListStaffQueryDto): Promise<{
        data: {
            items: {
                id: string | undefined;
                firstName: string | undefined;
                lastName: string | undefined;
                email: string | undefined;
                role: import("../users/entities/user.entity").UserRole | undefined;
                phone: string | undefined;
                emailVerified: boolean | undefined;
                twoFactorEnabled: boolean | undefined;
                lastLoginAt: Date | undefined;
                createdAt: Date | undefined;
                isActive: boolean;
                suspendedAt: Date | null;
                permissions: string[];
            }[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    getStaff(id: string): Promise<{
        data: {
            id: string | undefined;
            firstName: string | undefined;
            lastName: string | undefined;
            email: string | undefined;
            role: import("../users/entities/user.entity").UserRole | undefined;
            phone: string | undefined;
            emailVerified: boolean | undefined;
            twoFactorEnabled: boolean | undefined;
            lastLoginAt: Date | undefined;
            createdAt: Date | undefined;
            isActive: boolean;
            suspendedAt: Date | null;
            permissions: string[];
        };
    }>;
    createStaff(dto: CreateStaffDto, user: User): Promise<{
        data: {
            id: string | undefined;
            firstName: string | undefined;
            lastName: string | undefined;
            email: string | undefined;
            role: import("../users/entities/user.entity").UserRole | undefined;
            phone: string | undefined;
            emailVerified: boolean | undefined;
            twoFactorEnabled: boolean | undefined;
            lastLoginAt: Date | undefined;
            createdAt: Date | undefined;
            isActive: boolean;
            suspendedAt: Date | null;
            permissions: string[];
        };
    }>;
    updateRole(id: string, dto: UpdateStaffRoleDto, user: User): Promise<{
        data: {
            id: string | undefined;
            firstName: string | undefined;
            lastName: string | undefined;
            email: string | undefined;
            role: import("../users/entities/user.entity").UserRole | undefined;
            phone: string | undefined;
            emailVerified: boolean | undefined;
            twoFactorEnabled: boolean | undefined;
            lastLoginAt: Date | undefined;
            createdAt: Date | undefined;
            isActive: boolean;
            suspendedAt: Date | null;
            permissions: string[];
        };
    }>;
    replacePermissions(id: string, dto: UpdateStaffPermissionsDto, user: User): Promise<{
        data: {
            id: string | undefined;
            firstName: string | undefined;
            lastName: string | undefined;
            email: string | undefined;
            role: import("../users/entities/user.entity").UserRole | undefined;
            phone: string | undefined;
            emailVerified: boolean | undefined;
            twoFactorEnabled: boolean | undefined;
            lastLoginAt: Date | undefined;
            createdAt: Date | undefined;
            isActive: boolean;
            suspendedAt: Date | null;
            permissions: string[];
        };
    }>;
    togglePermission(id: string, dto: TogglePermissionDto, user: User): Promise<{
        data: {
            id: string | undefined;
            firstName: string | undefined;
            lastName: string | undefined;
            email: string | undefined;
            role: import("../users/entities/user.entity").UserRole | undefined;
            phone: string | undefined;
            emailVerified: boolean | undefined;
            twoFactorEnabled: boolean | undefined;
            lastLoginAt: Date | undefined;
            createdAt: Date | undefined;
            isActive: boolean;
            suspendedAt: Date | null;
            permissions: string[];
        };
    }>;
    enableAllPermissions(id: string, user: User): Promise<{
        data: {
            id: string | undefined;
            firstName: string | undefined;
            lastName: string | undefined;
            email: string | undefined;
            role: import("../users/entities/user.entity").UserRole | undefined;
            phone: string | undefined;
            emailVerified: boolean | undefined;
            twoFactorEnabled: boolean | undefined;
            lastLoginAt: Date | undefined;
            createdAt: Date | undefined;
            isActive: boolean;
            suspendedAt: Date | null;
            permissions: string[];
        };
    }>;
    disableAllPermissions(id: string, user: User): Promise<{
        data: {
            id: string | undefined;
            firstName: string | undefined;
            lastName: string | undefined;
            email: string | undefined;
            role: import("../users/entities/user.entity").UserRole | undefined;
            phone: string | undefined;
            emailVerified: boolean | undefined;
            twoFactorEnabled: boolean | undefined;
            lastLoginAt: Date | undefined;
            createdAt: Date | undefined;
            isActive: boolean;
            suspendedAt: Date | null;
            permissions: string[];
        };
    }>;
    suspendStaff(id: string, user: User): Promise<{
        data: {
            suspended: true;
        };
    }>;
    reactivateStaff(id: string, user: User): Promise<{
        data: {
            id: string | undefined;
            firstName: string | undefined;
            lastName: string | undefined;
            email: string | undefined;
            role: import("../users/entities/user.entity").UserRole | undefined;
            phone: string | undefined;
            emailVerified: boolean | undefined;
            twoFactorEnabled: boolean | undefined;
            lastLoginAt: Date | undefined;
            createdAt: Date | undefined;
            isActive: boolean;
            suspendedAt: Date | null;
            permissions: string[];
        };
    }>;
    deleteStaff(id: string, user: User): Promise<void>;
}
