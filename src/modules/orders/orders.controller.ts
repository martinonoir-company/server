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
import { CreateOrderDto, UpdateOrderStatusDto, OrderQueryDto } from './dto/order.dto';
import { PricingEngine, QuoteItem, QuoteContext } from './pricing.engine';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Public } from '../../shared/decorators/public.decorator';
import { User } from '../users/entities/user.entity';
import { IsArray, IsObject, IsString, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class QuoteContextDto {
  @IsString() currency!: string;
  @IsString() country!: string;
  @IsString() state!: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() couponCode?: string;
  @IsOptional() @IsString() shippingMethod?: string;
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

  // ── Transition Status ──
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user?: User,
  ) {
    const order = await this.ordersService.transitionStatus(id, dto, user?.id);
    return { data: order };
  }
}
