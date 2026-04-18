import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { StaffService } from './staff.service';
import { CreateStaffDto, UpdateStaffRoleDto, ListStaffQueryDto } from './dto/staff.dto';
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

  /** List all staff — requires staff:read */
  @Get()
  @RequirePermissions(Permission.STAFF_READ)
  async listStaff(@Query() query: ListStaffQueryDto) {
    const result = await this.staffService.listStaff(query);
    return { data: result };
  }

  /** Get single staff member */
  @Get(':id')
  @RequirePermissions(Permission.STAFF_READ)
  async getStaff(@Param('id') id: string) {
    const staff = await this.staffService.getStaff(id);
    return { data: staff };
  }

  /** Create staff + send invitation email — requires staff:create */
  @Post()
  @RequirePermissions(Permission.STAFF_CREATE)
  async createStaff(
    @Body() dto: CreateStaffDto,
    @CurrentUser() user: User,
  ) {
    const staff = await this.staffService.createStaff(dto, user);
    return { data: staff };
  }

  /** Update staff role — requires staff:update */
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

  /** Deactivate (soft-delete) staff — requires staff:delete */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.STAFF_DELETE)
  async deactivateStaff(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    await this.staffService.deactivateStaff(id, user);
  }

  /** Reactivate staff — requires staff:update */
  @Patch(':id/reactivate')
  @RequirePermissions(Permission.STAFF_UPDATE)
  async reactivateStaff(@Param('id') id: string) {
    const staff = await this.staffService.reactivateStaff(id);
    return { data: staff };
  }
}
