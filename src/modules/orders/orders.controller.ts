import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import {
  CreateOrderDto,
  UpdateOrderStatusDto,
  OrderQueryDto,
  DispatchOrderDto,
  DispatchScanDto,
  MarkDeliveredDto,
} from './dto/order.dto';
import { PricingEngine, QuoteItem, QuoteContext } from './pricing.engine';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Public } from '../../shared/decorators/public.decorator';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';
import { Permission } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { IsArray, IsObject, IsString, IsNumber, IsOptional, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CouponChannel } from '../coupons/entities/coupon.entity';
import { ShippingDispatchService } from '../shipping/shipping-dispatch.service';

class QuoteContextDto {
  @IsString() currency!: string;
  @IsString() country!: string;
  @IsString() state!: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() couponCode?: string;
  @IsOptional() @IsString() shippingMethod?: string;
  /** Sales channel the quote originates from — gates channel-scoped coupons. */
  @IsOptional() @IsEnum(CouponChannel) channel?: CouponChannel;
}

class QuoteItemDto {
  @IsString() variantId!: string;
  @IsString() sku!: string;
  @IsString() productName!: string;
  @IsOptional() @IsString() variantName?: string;
  @IsNumber() quantity!: number;
  @IsNumber() unitPrice!: number;
  @IsOptional() @IsNumber() compareAtPrice?: number;
  @IsOptional() @IsNumber() weightKg?: number;
  @IsOptional() @IsObject() options?: Record<string, string>;
}

class QuoteRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items!: QuoteItemDto[];

  @IsObject()
  @ValidateNested()
  @Type(() => QuoteContextDto)
  context!: QuoteContextDto;
}

@Controller({ path: 'orders', version: '1' })
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly pricingEngine: PricingEngine,
    private readonly shippingDispatch: ShippingDispatchService,
  ) {}

  // ── Price Quote (read-only, no side effects) ──
  @Public()
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  async quote(@Body() dto: QuoteRequestDto) {
    const result = await this.pricingEngine.quote(dto.items, dto.context);
    return { data: result };
  }

  // ── Checkout ──
  @Post('checkout')
  async checkout(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user?: User,
  ) {
    const order = await this.ordersService.checkout(dto, user?.id);
    return { data: order };
  }

  // ── List Orders (admin) ──
  @Get()
  async findAll(@Query() query: OrderQueryDto) {
    const result = await this.ordersService.findAll(query);
    return { data: result };
  }

  // ── Dispatch queue (POS + admin) ──
  //
  // Paginated + filterable list of orders that ship from a branch and so
  // need staff sorting + courier pickup. Same query contract as findAll
  // (status, dispatchStatus, dates, search, page/limit). Declared before the
  // `:id` route so "dispatch-queue" isn't swallowed as an id.
  @Get('dispatch-queue')
  @RequirePermissions(Permission.ORDERS_READ)
  async dispatchQueue(@Query() query: OrderQueryDto) {
    const result = await this.ordersService.findDispatchQueue(query);
    return { data: result };
  }

  // ── My Orders (customer) ──
  @Get('mine')
  async myOrders(
    @CurrentUser() user: User,
    @Query() query: OrderQueryDto,
  ) {
    query.userId = user.id;
    const result = await this.ordersService.findAll(query);
    return { data: result };
  }

  // ── Get Order by ID ──
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const order = await this.ordersService.findOne(id);
    return { data: order };
  }

  // ── Get Order by Number ──
  @Get('number/:orderNumber')
  async findByNumber(@Param('orderNumber') orderNumber: string) {
    const order = await this.ordersService.findByOrderNumber(orderNumber);
    return { data: order };
  }

  // ── Shipping: dispatch progress (post-payment UI) ──
  //
  // Returns the current AAJ-shipping state for an order so the
  // post-payment progress bar can render. Computed from the order row
  // alone (no AAJ call) — fast, no rate-limit concern. The frontend
  // polls this every ~3 seconds until trackingId is set or the order
  // hits the retry ceiling.
  @Get(':id/shipping')
  async shippingState(@Param('id') id: string) {
    const order = await this.ordersService.findOne(id);
    const progress = order.shippingOptOut
      ? 100
      : order.shippingTrackingId
        ? 100
        : order.shippingBookingId
          ? 66
          : order.shippingRetryCount > 0
            ? 10
            : 0;
    return {
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        optedOut: !!order.shippingOptOut,
        bookingId: order.shippingBookingId ?? null,
        trackingId: order.shippingTrackingId ?? null,
        labelUrl: order.shippingLabelUrl ?? null,
        status: order.shippingStatus ?? null,
        progress,
        lastError: order.shippingLastError ?? null,
        retryCount: order.shippingRetryCount,
      },
    };
  }

  // ── Shipping: live tracking ──
  //
  // Calls AAJ Express's track-shipment endpoint (cached 60 seconds on
  // the order row). Returns the customer-facing event timeline.
  @Get(':id/tracking')
  async tracking(@Param('id') id: string) {
    const data = await this.shippingDispatch.getTracking(id);
    return { data };
  }

  // ── Public tracking lookup by order number ──
  //
  // Used by the storefront's /track-order page so guests (and
  // customers who didn't sign in) can track a shipment with just an
  // order number. The endpoint discloses only shipping state — no
  // PII, payment data, or line items.
  @Public()
  @Get('public/track/:orderNumber')
  async publicTracking(@Param('orderNumber') orderNumber: string) {
    const order = await this.ordersService.findByOrderNumber(orderNumber);
    const data = await this.shippingDispatch.getTracking(order.id);
    return {
      data: {
        orderNumber: order.orderNumber,
        status: data.status,
        description: data.description,
        etaDays: data.etaDays,
        etaDate: data.etaDate,
        events: data.events,
        trackingNumber: data.trackingNumber,
        optedOut: data.optedOut,
        pending: data.pending,
      },
    };
  }

  // ── Transition Status (generic admin path) ──
  @Patch(':id/status')
  @RequirePermissions(Permission.ORDERS_UPDATE)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user?: User,
  ) {
    const order = await this.ordersService.transitionStatus(id, dto, user?.id);
    return { data: order };
  }

  // ── Dispatch (scanner mobile app) ──
  //
  // PROCESSING → SHIPPED with required trackingNumber + carrier + per-line
  // scanned quantity verification. Mirrors the FSM but enforces business
  // rules the generic /status path doesn't (qty match, tracking fields).
  @Post(':id/dispatch')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ORDERS_UPDATE)
  async dispatch(
    @Param('id') id: string,
    @Body() dto: DispatchOrderDto,
    @CurrentUser() user?: User,
  ) {
    const order = await this.ordersService.dispatchOrder(id, dto, user?.id);
    return { data: order };
  }

  // ── Dispatch scan (POS / scanner) ──
  //
  // A staff member scans the order barcode at the branch to acknowledge the
  // items have been sorted and handed to the AAJ courier. `ref` is the order
  // id or order number (what the barcode encodes). Flips dispatchStatus
  // PENDING → DISPATCHED; idempotent. Distinct from POST /:id/dispatch.
  @Post('dispatch-scan/:ref')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ORDERS_UPDATE)
  async dispatchScan(
    @Param('ref') ref: string,
    @Body() dto: DispatchScanDto,
    @CurrentUser() user?: User,
  ) {
    const order = await this.ordersService.markDispatchedByScan(
      ref,
      user?.id,
      dto?.note,
    );
    return { data: order };
  }

  // ── Mark Delivered ──
  //
  // SHIPPED → DELIVERED. Sets deliveredAt and fires the delivered email.
  // Idempotent: already-DELIVERED orders return as-is.
  @Post(':id/delivered')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ORDERS_UPDATE)
  async markDelivered(
    @Param('id') id: string,
    @Body() dto: MarkDeliveredDto,
    @CurrentUser() user?: User,
  ) {
    const order = await this.ordersService.markDelivered(id, dto, user?.id);
    return { data: order };
  }
}
