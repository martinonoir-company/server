import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PushService } from './push.service';
import { RegisterPushTokenDto, UnregisterPushTokenDto } from './dto/push.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

/**
 * Push-notification token lifecycle endpoints.
 *
 * Called by the storefront mobile app:
 *  - on first authenticated app launch (register)
 *  - on logout (unregister)
 *
 * Both routes require an authenticated user. The token is scoped to the
 * caller's userId — no cross-user registration is possible.
 */
@Controller({ path: 'notifications/push', version: '1' })
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(
    @Body() dto: RegisterPushTokenDto,
    @CurrentUser() user: User,
  ) {
    const token = await this.pushService.register(
      user.id,
      dto.expoPushToken,
      dto.platform,
      dto.deviceLabel,
    );
    return {
      data: {
        id: token.id,
        platform: token.platform,
        deviceLabel: token.deviceLabel,
        isActive: token.isActive,
        createdAt: token.createdAt,
      },
    };
  }

  @Post('unregister')
  @HttpCode(HttpStatus.OK)
  async unregister(
    @Body() dto: UnregisterPushTokenDto,
    @CurrentUser() user: User,
  ) {
    await this.pushService.unregister(user.id, dto.expoPushToken);
    return { data: { unregistered: true } };
  }
}
