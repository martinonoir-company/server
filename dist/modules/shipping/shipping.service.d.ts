import { AajProvider, AajAddress, AajPackageItem } from './aaj.provider';
export interface ShippingRate {
    carrier: string;
    service: string;
    estimatedDays: {
        min: number;
        max: number;
    };
    rate: number;
    currency: string;
    quoteId?: string;
    expiresAt?: string;
}
export interface ShippingRateInput {
    country: string;
    state: string;
    weightKg: number;
    currency: string;
    subtotal: number;
    recipient?: AajAddress;
    sender?: AajAddress;
    items?: AajPackageItem[];
    itemsValueNgn?: number;
}
export declare class ShippingService {
    private readonly aaj;
    private readonly logger;
    private readonly NG_ZONES;
    constructor(aaj: AajProvider);
    calculateRates(input: ShippingRateInput): Promise<ShippingRate[]>;
    private fallbackRates;
}
