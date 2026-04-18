import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ShippingService, ShippingRateInput } from './shipping.service';
import { GigLogisticsService, CourierShipmentInput } from './gig-logistics.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Public } from '../../shared/decorators/public.decorator';
import { IsString, IsNumber, IsOptional, IsObject, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

class ShippingRateDto {
  @IsString() country!: string;
  @IsString() state!: string;
  @IsNumber() @Min(0) weightKg!: number;
  @IsString() currency!: string;
  @IsNumber() @Min(0) subtotal!: number;
}

class AddressDto {
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsString() line1!: string;
  @IsOptional() @IsString() line2?: string;
  @IsString() city!: string;
  @IsString() state!: string;
  @IsString() country!: string;
  @IsOptional() @IsString() phone?: string;
}

class CreateShipmentDto {
  @IsString() orderId!: string;
  @IsString() orderNumber!: string;
  @IsObject() @ValidateNested() @Type(() => AddressDto) recipientAddress!: AddressDto;
  @IsNumber() @Min(0) weightKg!: number;
  @IsString() description!: string;
  @IsNumber() @Min(0) value!: number;
  @IsString() currency!: string;
}

@Controller({ path: 'shipping', version: '1' })
@UseGuards(JwtAuthGuard)
export class ShippingController {
  constructor(
    private readonly shippingService: ShippingService,
    private readonly gigLogistics: GigLogisticsService,
  ) {}

  /**
   * Calculate shipping rates for a destination.
   * Public — used during checkout before placing order.
   */
  @Public()
  @Post('rates')
  async calculateRates(@Body() dto: ShippingRateDto) {
    const rates = await this.shippingService.calculateRates(dto);
    return { data: rates };
  }

  /**
   * Create a shipment with courier (admin action after order is packed).
   */
  @Post('shipments')
  async createShipment(@Body() dto: CreateShipmentDto) {
    const result = await this.gigLogistics.createShipment({
      orderId: dto.orderId,
      orderNumber: dto.orderNumber,
      senderAddress: {
        line1: '12 Warehouse Road, Ikeja',
        city: 'Lagos',
        state: 'Lagos',
        country: 'NG',
      },
      recipientAddress: dto.recipientAddress,
      packageDetails: {
        weightKg: dto.weightKg,
        description: dto.description,
        value: dto.value,
        currency: dto.currency,
      },
    });
    return { data: result };
  }

  /**
   * Track a shipment by tracking number (public for customers).
   */
  @Public()
  @Get('track/:trackingNumber')
  async trackShipment(@Param('trackingNumber') trackingNumber: string) {
    const result = await this.gigLogistics.trackShipment(trackingNumber);
    return { data: result };
  }
}
