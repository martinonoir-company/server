import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PosSessionsService } from './pos-sessions.service';
import {
  AddSessionItemDto,
  ConfirmSessionDto,
  OpenSessionDto,
  PaymentIntentDto,
  UpdateSessionItemDto,
  VoidSessionDto,
} from './dto/pos-session.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Permission } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';

/**
 * POS session API — the live terminal cart shared between the POS web app
 * and the scanner. URLs use the human-readable terminal CODE
 * (e.g. LAGOS-VI-POS-01).
 *
 * Every endpoint requires POS_SELL (held by COMPANY_STAFF and above).
 * Mutating endpoints carry the client's optimistic-concurrency `version`
 * in the body; a stale version returns 409 SESSION_VERSION_CONFLICT with
 * the current version so the client can refetch and retry.
 */
@Controller({ path: 'pos-sessions', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@RequirePermissions(Permission.POS_SELL)
export class PosSessionsController {
  constructor(private readonly service: PosSessionsService) {}

  @Post(':terminalCode/open')
  @HttpCode(HttpStatus.OK)
  async open(
    @Param('terminalCode') terminalCode: string,
    @Body() dto: OpenSessionDto,
    @CurrentUser() user: User,
  ) {
    const session = await this.service.open(
      terminalCode,
      { staffId: user.id, role: user.role },
      dto.currency,
    );
    return { data: session };
  }

  @Get(':terminalCode')
  async getCurrent(
    @Param('terminalCode') terminalCode: string,
    @CurrentUser() user: User,
  ) {
    const session = await this.service.getCurrent(terminalCode, {
      staffId: user.id,
      role: user.role,
    });
    return { data: session };
  }

  @Post(':terminalCode/items')
  @HttpCode(HttpStatus.OK)
  async addItem(
    @Param('terminalCode') terminalCode: string,
    @Body() dto: AddSessionItemDto,
    @CurrentUser() user: User,
  ) {
    const session = await this.service.addItem(
      terminalCode,
      { staffId: user.id, role: user.role },
      dto,
    );
    return { data: session };
  }

  @Patch(':terminalCode/items/:lineId')
  async updateItem(
    @Param('terminalCode') terminalCode: string,
    @Param('lineId') lineId: string,
    @Body() dto: UpdateSessionItemDto,
    @CurrentUser() user: User,
  ) {
    const session = await this.service.updateItem(
      terminalCode,
      { staffId: user.id, role: user.role },
      lineId,
      dto,
    );
    return { data: session };
  }

  @Post(':terminalCode/payment-intent')
  @HttpCode(HttpStatus.OK)
  async paymentIntent(
    @Param('terminalCode') terminalCode: string,
    @Body() dto: PaymentIntentDto,
    @CurrentUser() user: User,
  ) {
    const session = await this.service.paymentIntent(
      terminalCode,
      { staffId: user.id, role: user.role },
      dto,
    );
    return { data: session };
  }

  @Post(':terminalCode/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @Param('terminalCode') terminalCode: string,
    @Body() dto: ConfirmSessionDto,
    @CurrentUser() user: User,
  ) {
    const session = await this.service.confirm(
      terminalCode,
      { staffId: user.id, role: user.role },
      dto,
    );
    return { data: session };
  }

  @Post(':terminalCode/void')
  @HttpCode(HttpStatus.OK)
  async void(
    @Param('terminalCode') terminalCode: string,
    @Body() dto: VoidSessionDto,
    @CurrentUser() user: User,
  ) {
    const session = await this.service.void(
      terminalCode,
      { staffId: user.id, role: user.role },
      dto.version,
      dto.reason,
    );
    return { data: session };
  }
}
