import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { StaffService } from './staff.service';
import {
  CreateStaffDto,
  UpdateStaffRoleDto,
  UpdateStaffPermissionsDto,
  TogglePermissionDto,
  ListStaffQueryDto,
} from './dto/staff.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Permission } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';

@Controller({ path: 'staff', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  /** List staff (optionally including suspended) — requires staff:read. */
  @Get()
  @RequirePermissions(Permission.STAFF_READ)
  async listStaff(@Query() query: ListStaffQueryDto) {
    const result = await this.staffService.listStaff(query);
    return { data: result };
  }

  @Get(':id')
  @RequirePermissions(Permission.STAFF_READ)
  async getStaff(@Param('id') id: string) {
    const staff = await this.staffService.getStaff(id);
    return { data: staff };
  }

  @Post()
  @RequirePermissions(Permission.STAFF_CREATE)
  async createStaff(
    @Body() dto: CreateStaffDto,
    @CurrentUser() user: User,
  ) {
    const staff = await this.staffService.createStaff(dto, user);
    return { data: staff };
  }

  @Patch(':id/role')
  @RequirePermissions(Permission.STAFF_UPDATE)
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateStaffRoleDto,
    @CurrentUser() user: User,
  ) {
    const staff = await this.staffService.updateRole(id, dto, user);
    return { data: staff };
  }

  /** Replace the entire per-user permission override list. */
  @Put(':id/permissions')
  @RequirePermissions(Permission.STAFF_UPDATE)
  async replacePermissions(
    @Param('id') id: string,
    @Body() dto: UpdateStaffPermissionsDto,
    @CurrentUser() user: User,
  ) {
    const staff = await this.staffService.replacePermissions(id, dto, user);
    return { data: staff };
  }

  /** Flip a single permission flag. */
  @Patch(':id/permissions')
  @RequirePermissions(Permission.STAFF_UPDATE)
  async togglePermission(
    @Param('id') id: string,
    @Body() dto: TogglePermissionDto,
    @CurrentUser() user: User,
  ) {
    const staff = await this.staffService.togglePermission(id, dto, user);
    return { data: staff };
  }

  /** Grant every permission currently defined. */
  @Post(':id/permissions/enable-all')
  @RequirePermissions(Permission.STAFF_UPDATE)
  async enableAllPermissions(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const staff = await this.staffService.enableAllPermissions(id, user);
    return { data: staff };
  }

  /** Revoke every permission. */
  @Post(':id/permissions/disable-all')
  @RequirePermissions(Permission.STAFF_UPDATE)
  async disableAllPermissions(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const staff = await this.staffService.disableAllPermissions(id, user);
    return { data: staff };
  }

  /** Suspend (soft-delete) + revoke sessions. */
  @Patch(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.STAFF_UPDATE)
  async suspendStaff(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<{ data: { suspended: true } }> {
    await this.staffService.suspendStaff(id, user);
    return { data: { suspended: true } };
  }

  @Patch(':id/reactivate')
  @RequirePermissions(Permission.STAFF_UPDATE)
  async reactivateStaff(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const staff = await this.staffService.reactivateStaff(id, user);
    return { data: staff };
  }

  /** Hard-delete — irreversible. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.STAFF_DELETE)
  async deleteStaff(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    await this.staffService.deleteStaff(id, user);
  }
}
