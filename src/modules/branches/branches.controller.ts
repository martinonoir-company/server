import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';
import { CreateTerminalDto, UpdateTerminalDto } from './dto/terminal.dto';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Permission } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';

/**
 * Branches REST API.
 *
 * Read endpoints (`GET`) require only authentication; the service scopes
 * results to what the caller is allowed to see.
 *
 * Write endpoints require BRANCHES_MANAGE (granted to SUPER_ADMIN and
 * COMPANY_SUPER_ADMIN).
 */
@Controller({ path: 'branches', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  // ── Branches ──

  /** List branches visible to the caller. */
  @Get()
  async list(@CurrentUser() user: User) {
    const branches = await this.branchesService.listForUser({
      id: user.id,
      role: user.role,
    });
    return { data: branches };
  }

  /** Get one branch by id. Enforces visibility. */
  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: User) {
    const branch = await this.branchesService.getByIdForUser(id, {
      id: user.id,
      role: user.role,
    });
    return { data: branch };
  }

  @Post()
  @RequirePermissions(Permission.BRANCHES_MANAGE)
  async create(@Body() dto: CreateBranchDto) {
    const branch = await this.branchesService.create(dto);
    return { data: branch };
  }

  @Patch(':id')
  @RequirePermissions(Permission.BRANCHES_MANAGE)
  async update(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    const branch = await this.branchesService.update(id, dto);
    return { data: branch };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.BRANCHES_MANAGE)
  async remove(@Param('id') id: string) {
    const result = await this.branchesService.softDelete(id);
    return { data: result };
  }

  // ── Terminals (nested under a branch) ──

  @Get(':id/terminals')
  async listTerminals(@Param('id') id: string, @CurrentUser() user: User) {
    const terminals = await this.branchesService.listTerminals(id, {
      id: user.id,
      role: user.role,
    });
    return { data: terminals };
  }

  @Post(':id/terminals')
  @RequirePermissions(Permission.BRANCHES_MANAGE)
  async createTerminal(@Param('id') id: string, @Body() dto: CreateTerminalDto) {
    const terminal = await this.branchesService.createTerminal(id, dto);
    return { data: terminal };
  }

  @Patch(':id/terminals/:terminalId')
  @RequirePermissions(Permission.BRANCHES_MANAGE)
  async updateTerminal(
    @Param('id') id: string,
    @Param('terminalId') terminalId: string,
    @Body() dto: UpdateTerminalDto,
  ) {
    const terminal = await this.branchesService.updateTerminal(id, terminalId, dto);
    return { data: terminal };
  }

  @Delete(':id/terminals/:terminalId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.BRANCHES_MANAGE)
  async removeTerminal(
    @Param('id') id: string,
    @Param('terminalId') terminalId: string,
  ) {
    const result = await this.branchesService.softDeleteTerminal(id, terminalId);
    return { data: result };
  }

  // ── Staff assignments ──

  @Post(':id/staff')
  @RequirePermissions(Permission.BRANCHES_MANAGE)
  async assignStaff(@Param('id') id: string, @Body() dto: AssignStaffDto) {
    const assignment = await this.branchesService.assignStaff(id, dto.userId);
    return { data: assignment };
  }

  @Delete(':id/staff/:userId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.BRANCHES_MANAGE)
  async unassignStaff(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    const result = await this.branchesService.unassignStaff(id, userId);
    return { data: result };
  }
}
