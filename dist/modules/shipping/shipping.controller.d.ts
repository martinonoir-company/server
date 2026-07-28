import { ShippingService } from './shipping.service';
import { GigLogisticsService } from './gig-logistics.service';
declare class ShippingRateDto {
    country: string;
    state: string;
    weightKg: number;
    currency: string;
    subtotal: number;
}
declare class AddressDto {
    firstName: string;
    lastName: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    country: string;
    phone?: string;
}
declare class CreateShipmentDto {
    orderId: string;
    orderNumber: string;
    recipientAddress: AddressDto;
    weightKg: number;
    description: string;
    value: number;
    currency: string;
}
export declare class ShippingController {
    private readonly shippingService;
    private readonly gigLogistics;
    constructor(shippingService: ShippingService, gigLogistics: GigLogisticsService);
    calculateRates(dto: ShippingRateDto): Promise<{
        data: import("./shipping.service").ShippingRate[];
    }>;
    createShipment(dto: CreateShipmentDto): Promise<{
        data: import("./gig-logistics.service").CourierShipmentResult;
    }>;
    trackShipment(trackingNumber: string): Promise<{
        data: import("./gig-logistics.service").TrackingResult;
    }>;
}
export {};
