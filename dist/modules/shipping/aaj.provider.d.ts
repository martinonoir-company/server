export interface AajAddress {
    name: string;
    phone: string;
    email: string;
    company?: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    stateOrProvinceCode?: string;
    countryCode: string;
    country: string;
    postalCode: string;
    landmark?: string;
}
export interface AajPackageItem {
    name: string;
    quantity: number;
    price: number;
    unitMeasurement?: string;
    hsCode?: string;
    manufacturerCountry?: string;
    excludePackingList?: boolean;
}
export interface AajPackageInput {
    actualWeight: number;
    predefinedDimension?: string;
    dimension?: {
        length: number;
        width: number;
        height: number;
        weight: number;
    };
    items: AajPackageItem[];
}
export type AajResult<T> = {
    ok: true;
    data: T;
} | {
    ok: false;
    error: string;
    statusCode?: number;
    raw?: unknown;
};
export interface AajQuoteResult {
    totalNgn: number;
    shippingFeeNgn: number;
    taxNgn: number;
    bookingId: string;
    expiresAt: string;
    etaDays: number;
    etaDate: string;
    raw: Record<string, unknown>;
}
export interface AajCreateBookingResult {
    bookingId: string;
    humanizedName: string;
    totalNgn: number;
    shippingFeeNgn: number;
    raw: Record<string, unknown>;
}
export interface AajProcessBookingResult {
    trackingId: string;
    labelUrl?: string;
    raw: Record<string, unknown>;
}
export interface AajTrackingEvent {
    dateTime: string;
    status: number;
    scanType: string;
    description: string;
    location: string;
}
export interface AajTrackingResult {
    trackingNumber: string;
    status: number;
    description: string;
    etaDays?: number;
    etaDate?: string;
    events: AajTrackingEvent[];
    raw: Record<string, unknown>;
}
export declare class AajProvider {
    private readonly logger;
    private readonly apiKey;
    private readonly baseUrl;
    private readonly isLive;
    private readonly defaultCategoryId;
    private readonly accountNumber;
    private readonly predefinedDimensionId;
    private readonly paymentMethod;
    constructor();
    private toE164;
    getQuote(input: {
        sender: AajAddress;
        receiver: AajAddress;
        itemsValueNgn: number;
        weightKg: number;
        items?: AajPackageItem[];
        serviceType?: 'DOMESTIC' | 'AIR_EXPORT' | 'SEA_EXPORT' | 'AIR_IMPORT';
        deliveryMode?: 'DOOR_STEP' | 'PICKUP';
    }): Promise<AajResult<AajQuoteResult>>;
    createBooking(input: {
        customBookingId: string;
        sender: AajAddress;
        receiver: AajAddress;
        itemsValueNgn: number;
        weightKg: number;
        items: AajPackageItem[];
        description?: string;
        serviceType?: 'DOMESTIC' | 'AIR_EXPORT' | 'SEA_EXPORT' | 'AIR_IMPORT';
        deliveryMode?: 'DOOR_STEP' | 'PICKUP';
        categoryId?: string;
    }): Promise<AajResult<AajCreateBookingResult>>;
    processBooking(bookingId: string): Promise<AajResult<AajProcessBookingResult>>;
    trackShipment(trackingId: string): Promise<AajResult<AajTrackingResult>>;
    private prepareAddress;
    private addressForQuote;
    private addressForBooking;
    private post;
    private get;
    private send;
}
