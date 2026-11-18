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
    private readonly NG_STATE_BASE;
    private readonly NG_PER_EXTRA_KG;
    constructor(aaj: AajProvider);
    buildSenderAddress(): AajAddress;
    calculateRates(input: ShippingRateInput): Promise<ShippingRate[]>;
    private fallbackRates;
}
