import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateProfileDto, ChangePasswordDto } from './dto/account.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { User } from './entities/user.entity';

@Controller({ path: 'account', version: '1' })
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(private readonly usersService: UsersService) {}

  /** Get current user's profile */
  @Get('profile')
  async getProfile(@CurrentUser() user: User) {
    const profile = await this.usersService.getProfile(user.id);
    return { data: profile };
  }

  /** Update profile info (name, phone, country) */
  @Put('profile')
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ) {
    const profile = await this.usersService.updateProfile(user.id, dto);
    return { data: profile };
  }

  /** Change password (requires current password) */
  @Post('password')
  async changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.usersService.changePassword(user.id, dto);
    return { message: 'Password changed successfully' };
  }
}
