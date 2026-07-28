import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Repository } from 'typeorm';
import { Role } from '../../modules/users/entities/role.entity';
export declare class RolesGuard implements CanActivate {
    private readonly reflector;
    private readonly roleRepo;
    constructor(reflector: Reflector, roleRepo: Repository<Role>);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private mapUserRoleToRoleName;
}
