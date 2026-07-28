export interface CourierShipmentInput {
    orderId: string;
    orderNumber: string;
    senderAddress: {
        line1: string;
        city: string;
        state: string;
        country: string;
    };
    recipientAddress: {
        firstName: string;
        lastName: string;
        line1: string;
        line2?: string;
        city: string;
        state: string;
        country: string;
        phone?: string;
    };
    packageDetails: {
        weightKg: number;
        description: string;
        value: number;
        currency: string;
    };
}
export interface CourierShipmentResult {
    trackingNumber: string;
    carrier: string;
    estimatedDelivery: string;
    labelUrl?: string;
    status: 'BOOKED' | 'FAILED';
    providerReference?: string;
}
export interface TrackingEvent {
    timestamp: string;
    status: string;
    location: string;
    description: string;
}
export interface TrackingResult {
    trackingNumber: string;
    carrier: string;
    currentStatus: string;
    events: TrackingEvent[];
}
export declare class GigLogisticsService {
    private readonly logger;
    private readonly apiKey;
    private readonly baseUrl;
    private readonly isLive;
    constructor();
    createShipment(input: CourierShipmentInput): Promise<CourierShipmentResult>;
    trackShipment(trackingNumber: string): Promise<TrackingResult>;
}
