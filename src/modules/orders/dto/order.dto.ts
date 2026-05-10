import { IsString, IsOptional, IsNumber, IsArray, IsEnum, ValidateNested, Min, MaxLength, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus, PaymentMethod, OrderChannel } from '../entities/order.entity';

export class CheckoutItemDto {
  @IsString()
  variantId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class ShippingAddressDto {
  @IsString() @MaxLength(100) firstName!: string;
  @IsString() @MaxLength(100) lastName!: string;
  @IsString() @MaxLength(500) line1!: string;
  @IsOptional() @IsString() @MaxLength(500) line2?: string;
  @IsString() @MaxLength(100) city!: string;
  @IsString() @MaxLength(100) state!: string;
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;
  @IsString() @MaxLength(3) country!: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
}

export class CreateOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress!: ShippingAddressDto;

  @IsOptional()
  @IsString() @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsEnum(OrderChannel)
  channel?: OrderChannel;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString() @MaxLength(50)
  couponCode?: string;

  @IsOptional()
  @IsString()
  customerNote?: string;

  @IsOptional()
  @IsEmail()
  guestEmail?: string;

  @IsOptional()
  @IsString() @MaxLength(64)
  idempotencyKey?: string;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

/** One line in a dispatch payload: links a scanned qty to an order item. */
export class DispatchOrderItemDto {
  @IsString()
  orderItemId!: string;

  @IsNumber()
  @Min(1)
  scannedQty!: number;
}

/**
 * Body for POST /orders/:id/dispatch — scanner mobile app confirms a
 * physical handoff to the courier. Tracking number and carrier are
 * required; per-line scanned quantities must match the order's ordered
 * quantities (server-side validation).
 */
export class DispatchOrderDto {
  @IsString()
  @MaxLength(100)
  trackingNumber!: string;

  @IsString()
  @MaxLength(100)
  carrier!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DispatchOrderItemDto)
  items!: DispatchOrderItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * Body for POST /orders/:id/delivered — courier confirms delivery, or an
 * admin marks delivery manually.
 */
export class MarkDeliveredDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class OrderQueryDto {
  @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsEnum(OrderChannel) channel?: OrderChannel;
  @IsOptional() @IsNumber() @Min(1) page?: number;
  @IsOptional() @IsNumber() @Min(1) limit?: number;
  @IsOptional() @IsEnum(['createdAt', 'grandTotal', 'orderNumber']) sortBy?: string;
  @IsOptional() @IsEnum(['ASC', 'DESC']) sortOrder?: 'ASC' | 'DESC';
  /** ISO date string — filter orders created on or after this date */
  @IsOptional() @IsString() startDate?: string;
  /** ISO date string — filter orders created on or before this date */
  @IsOptional() @IsString() endDate?: string;
  /** Search by order number */
  @IsOptional() @IsString() search?: string;
}
