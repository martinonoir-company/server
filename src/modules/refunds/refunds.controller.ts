import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';
import { Permission } from '../users/entities/role.entity';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { RefundsService } from './refunds.service';
import {
  RefundStatus,
  RefundMethod,
} from './entities/refund-request.entity';
import { PaymentChannel } from '../payments/entities/payment.entity';
import { PaystackProvider } from '../payments/providers/paystack.provider';

// ── DTOs ──

class RefundLineDto {
  @IsString() clientLineId!: string;
  @IsString() variantId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() orderItemId?: string;
  @IsOptional() @IsString() reasonCode?: string;
  @IsOptional() @IsString() reasonNote?: string;
}

class CreateRefundFromReturnDto {
  @IsString() orderId!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RefundLineDto)
  lines!: RefundLineDto[];
  @IsOptional() @IsString() warehouseCode?: string;
  @IsOptional() @IsString() reason?: string;
  /** True for cash refunds paid out of the till. */
  @IsOptional() posCashRefund?: boolean;
  /** Set for POS bank-transfer refunds; must be verified upstream. */
  @IsOptional() bankDetails?: {
    bankCode: string;
    accountNumber: string;
    accountName: string;
  };
  /** Custom refund total in minor units. Required when `lines` is empty. */
  @IsOptional() @IsInt() @Min(1) customAmount?: number;
}

class ApproveRefundDto {
  /**
   * Optional override of the refund amount, in minor units. Super admin
   * uses this when the original request needs reducing (e.g. partial
   * refund) before sending it to Paystack.
   */
  @IsOptional() @IsInt() @Min(1) amount?: number;
}

class VerifyBankAccountDto {
  @IsString() accountNumber!: string;
  @IsString() bankCode!: string;
}

class RejectRefundDto {
  @IsOptional() @IsString() decisionReason?: string;
}

@Controller({ path: 'refunds', version: '1' })
@UseGuards(JwtAuthGuard)
export class RefundsController {
  private readonly logger = new Logger(RefundsController.name);

  constructor(
    private readonly refundsService: RefundsService,
    private readonly paystack: PaystackProvider,
  ) {}

  // ── Scanner / POS: lookup + create ──

  /**
   * Resolve an order by its order number so the scanner can show what's
   * on it before the cashier scans the returned items. Open to any user
   * with INVENTORY_ADJUST (scanner staff already have this).
   */
  @Get('order-lookup/:orderNumber')
  @RequirePermissions(Permission.INVENTORY_ADJUST)
  async lookupOrder(@Param('orderNumber') orderNumber: string) {
    const data = await this.refundsService.lookupOrderForReturn(orderNumber);
    return { data };
  }

  /**
   * Submit a return-with-refund. Creates stock RETURN movements AND a
   * refund_request row in one transaction.
   */
  @Post()
  @RequirePermissions(Permission.INVENTORY_ADJUST)
  async create(
    @Body() dto: CreateRefundFromReturnDto,
    @CurrentUser() user: User,
  ) {
    const refund = await this.refundsService.createFromReturn({
      orderId: dto.orderId,
      lines: dto.lines,
      warehouseCode: dto.warehouseCode,
      reason: dto.reason,
      posCashRefund: dto.posCashRefund,
      bankDetails: dto.bankDetails,
      customAmount: dto.customAmount,
      createdBy: user.id,
    });
    return { data: refund };
  }

  /**
   * Verify a Nigerian bank account at Paystack before the POS submits a
   * transfer-refund request — the returned account name is shown to the
   * cashier so they can confirm with the customer.
   */
  @Post('verify-bank-account')
  @RequirePermissions(Permission.INVENTORY_ADJUST)
  async verifyBankAccount(@Body() dto: VerifyBankAccountDto) {
    const res = await this.paystack.resolveBankAccount({
      accountNumber: dto.accountNumber,
      bankCode: dto.bankCode,
    });
    if ('error' in res) {
      return { data: { ok: false, error: res.error } };
    }
    return { data: { ok: true, accountName: res.accountName } };
  }

  /** Paystack-supported NG bank list for the POS's bank dropdown. */
  @Get('banks')
  @RequirePermissions(Permission.INVENTORY_ADJUST)
  async listBanks() {
    const banks = await this.paystack.listBanks();
    return { data: banks };
  }

  // ── Super admin ──

  @Get()
  @RequirePermissions(Permission.REFUNDS_VIEW)
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.refundsService.list({
      page: page ? parseInt(page, 10) || 1 : 1,
      limit: limit ? parseInt(limit, 10) || 20 : 20,
      status: status ? (status as RefundStatus) : undefined,
      channel: channel ? (channel as PaymentChannel) : undefined,
      search: search || undefined,
    });
    return { data };
  }

  @Get(':id')
  @RequirePermissions(Permission.REFUNDS_VIEW)
  async findOne(@Param('id') id: string) {
    const data = await this.refundsService.findById(id);
    return { data };
  }

  @Post(':id/approve')
  @RequirePermissions(Permission.REFUNDS_PROCESS)
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveRefundDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.refundsService.approve(id, user.id, dto.amount);
    return { data };
  }

  @Post(':id/reject')
  @RequirePermissions(Permission.REFUNDS_PROCESS)
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectRefundDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.refundsService.reject(
      id,
      user.id,
      dto.decisionReason,
    );
    return { data };
  }

  @Post(':id/retry')
  @RequirePermissions(Permission.REFUNDS_PROCESS)
  async retry(@Param('id') id: string) {
    const data = await this.refundsService.execute(id);
    return { data };
  }
}
