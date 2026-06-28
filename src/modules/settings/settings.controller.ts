import {
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsInt, Min } from 'class-validator';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Public } from '../../shared/decorators/public.decorator';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';
import { Permission } from '../users/entities/role.entity';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

class UpdateWholesaleMinQtyDto {
  @IsInt()
  @Min(1)
  wholesaleMinQty!: number;
}

@Controller({ path: 'settings', version: '1' })
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Public storefront/mobile config. Currently just the wholesale minimum
   * order quantity. Public so guests get the same gate the server enforces.
   */
  @Public()
  @Get('public')
  async publicConfig() {
    return { data: await this.settingsService.getPublicConfig() };
  }

  /** Admin read of the store settings (any staff with settings:read). */
  @Get()
  @RequirePermissions(Permission.SETTINGS_READ)
  async getAll() {
    return {
      data: { wholesaleMinQty: await this.settingsService.getWholesaleMinQty() },
    };
  }

  /** Update the wholesale minimum quantity — super admin only (settings:update). */
  @Put('wholesale-min-qty')
  @RequirePermissions(Permission.SETTINGS_UPDATE)
  async updateWholesaleMinQty(
    @Body() dto: UpdateWholesaleMinQtyDto,
    @CurrentUser() user?: User,
  ) {
    const value = await this.settingsService.setWholesaleMinQty(
      dto.wholesaleMinQty,
      user?.id,
    );
    return { data: { wholesaleMinQty: value } };
  }
}
