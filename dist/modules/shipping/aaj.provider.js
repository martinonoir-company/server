"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AajProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AajProvider = void 0;
const common_1 = require("@nestjs/common");
const ng_state_codes_1 = require("./ng-state-codes");
let AajProvider = AajProvider_1 = class AajProvider {
    constructor() {
        this.logger = new common_1.Logger(AajProvider_1.name);
        const raw = process.env['AAJ_API_KEY'] ?? '';
        this.apiKey = raw.trim().replace(/^["']|["']$/g, '');
        this.baseUrl = (process.env['AAJ_BASE_URL'] ?? 'https://booking.aajexpress.org/api/v2').replace(/\/+$/, '');
        this.isLive = !!this.apiKey;
        this.defaultCategoryId = process.env['AAJ_DEFAULT_CATEGORY_ID'] ?? '';
        this.accountNumber = process.env['AAJ_ACCOUNT_NUMBER'] ?? '';
        this.predefinedDimensionId =
            process.env['AAJ_PREDEFINED_DIMENSION_ID'] ?? '';
        this.paymentMethod =
            process.env['AAJ_PAYMENT_METHOD'] ??
                'WALLET';
        if (!this.isLive) {
            this.logger.warn('AAJ_API_KEY not set — running in stub mode (no real bookings).');
        }
        else {
            if (!this.defaultCategoryId || !this.accountNumber) {
                this.logger.warn('AAJ_DEFAULT_CATEGORY_ID and/or AAJ_ACCOUNT_NUMBER missing. ' +
                    'Live calls will likely 400 on create-booking.');
            }
            if (!this.predefinedDimensionId) {
                this.logger.warn('AAJ_PREDEFINED_DIMENSION_ID not set — AAJ rejects packages with ' +
                    'no dimensions ("predefinedDimension ID or packageDimension data").');
            }
        }
    }
    toE164(phone) {
        const raw = (phone ?? '').trim();
        if (!raw)
            return '';
        if (raw.startsWith('+')) {
            return '+' + raw.slice(1).replace(/\D/g, '');
        }
        let digits = raw.replace(/\D/g, '');
        if (digits.startsWith('00'))
            return '+' + digits.slice(2);
        if (digits.startsWith('0'))
            digits = digits.slice(1);
        if (digits.startsWith('234'))
            return '+' + digits;
        return '+234' + digits;
    }
    async getQuote(input) {
        const serviceType = input.serviceType ??
            (input.sender.countryCode === input.receiver.countryCode
                ? 'DOMESTIC'
                : 'AIR_EXPORT');
        const deliveryMode = input.deliveryMode ?? 'DOOR_STEP';
        const senderAddress = this.prepareAddress(input.sender);
        const receiverAddress = this.prepareAddress(input.receiver);
        if (!this.isLive) {
            const total = Math.max(2000, Math.round(input.weightKg * 1500));
            return {
                ok: true,
                data: {
                    totalNgn: total,
                    shippingFeeNgn: Math.round(total * 0.93),
                    taxNgn: Math.round(total * 0.07),
                    bookingId: `STUB-${Date.now().toString(36)}`,
                    expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
                    etaDays: 3,
                    etaDate: new Date(Date.now() + 3 * 86400 * 1000).toISOString(),
                    raw: { stub: true },
                },
            };
        }
        const body = {
            sender: {
                addressDetails: this.addressForQuote(senderAddress),
            },
            receiver: {
                addressDetails: this.addressForQuote(receiverAddress),
            },
            serviceType,
            carrier: 'AAJ',
            packages: {
                itemsValue: Math.max(0, Math.round(input.itemsValueNgn)),
                packageType: 'regular',
                packages: [
                    {
                        actualWeight: Math.max(0.1, input.weightKg),
                        ...(this.predefinedDimensionId
                            ? { predefinedDimension: this.predefinedDimensionId }
                            : {}),
                        ...(input.items
                            ? {
                                items: input.items.map((i) => ({
                                    name: i.name,
                                    quantity: i.quantity,
                                    price: i.price,
                                })),
                            }
                            : {}),
                    },
                ],
            },
            deliveryMode,
        };
        const res = await this.post('/quote', body);
        if (!res.ok)
            return res;
        const data = res.data;
        const quote = data?.data?.quotes?.[0];
        if (!quote) {
            return {
                ok: false,
                error: 'AAJ returned no quote options',
                raw: data,
            };
        }
        return {
            ok: true,
            data: {
                totalNgn: Number(quote.total ?? 0),
                shippingFeeNgn: Number(quote.shippingFee ?? 0),
                taxNgn: Number(quote.tax ?? 0),
                bookingId: String(quote.booking),
                expiresAt: quote.expirationDate ??
                    new Date(Date.now() + 20 * 60 * 1000).toISOString(),
                etaDays: Number(quote.eta?.number_of_days ?? 3),
                etaDate: quote.eta?.date_of_arrival ??
                    new Date(Date.now() + 3 * 86400 * 1000).toISOString(),
                raw: quote,
            },
        };
    }
    async createBooking(input) {
        const serviceType = input.serviceType ??
            (input.sender.countryCode === input.receiver.countryCode
                ? 'DOMESTIC'
                : 'AIR_EXPORT');
        const deliveryMode = input.deliveryMode ?? 'DOOR_STEP';
        const categoryId = input.categoryId ?? this.defaultCategoryId;
        const senderAddress = this.prepareAddress(input.sender);
        const receiverAddress = this.prepareAddress(input.receiver);
        if (!this.isLive) {
            const bookingId = `STUB-${Date.now().toString(36)}-${Math.random()
                .toString(36)
                .slice(2, 8)}`;
            return {
                ok: true,
                data: {
                    bookingId,
                    humanizedName: `BKG${bookingId}`,
                    totalNgn: Math.max(2000, Math.round(input.weightKg * 1500)),
                    shippingFeeNgn: Math.max(1860, Math.round(input.weightKg * 1395)),
                    raw: { stub: true, customBookingId: input.customBookingId },
                },
            };
        }
        if (serviceType === 'DOMESTIC' && !categoryId) {
            return {
                ok: false,
                error: 'AAJ_DEFAULT_CATEGORY_ID is not set — domestic bookings require it.',
            };
        }
        const body = {
            customBookingId: input.customBookingId,
            sender: {
                contact: {
                    name: input.sender.name,
                    phone: this.toE164(input.sender.phone),
                    email: input.sender.email,
                    ...(input.sender.company ? { company: input.sender.company } : {}),
                },
                addressDetails: this.addressForBooking(senderAddress),
            },
            receiver: {
                contact: {
                    name: input.receiver.name,
                    phone: this.toE164(input.receiver.phone),
                    email: input.receiver.email,
                    ...(input.receiver.company
                        ? { company: input.receiver.company }
                        : {}),
                },
                addressDetails: this.addressForBooking(receiverAddress),
            },
            packageInsurance: 'FR',
            packages: {
                packageType: 'regular',
                itemsValue: Math.max(0, Math.round(input.itemsValueNgn)),
                packages: [
                    {
                        unitMeasurement: 'KGS',
                        actualWeight: Math.max(0.1, input.weightKg),
                        ...(this.predefinedDimensionId
                            ? { predefinedDimension: this.predefinedDimensionId }
                            : {}),
                        items: input.items.map((i) => ({
                            name: i.name,
                            quantity: i.quantity,
                            price: i.price,
                            unitMeasurement: 'KGS',
                            ...(i.hsCode ? { hsCode: i.hsCode } : {}),
                            ...(i.manufacturerCountry
                                ? { manufacturerCountry: i.manufacturerCountry }
                                : {}),
                            excludePackingList: i.excludePackingList ?? false,
                        })),
                    },
                ],
                addOns: [],
                createMultiple: false,
            },
            payments: {
                ...(this.accountNumber ? { accountNumber: this.accountNumber } : {}),
                transaction: {
                    generateTransaction: true,
                    method: this.paymentMethod,
                },
            },
            carrier: 'AAJ',
            serviceType,
            deliveryMode,
            description: input.description ?? 'Martinonoir order',
            ...(categoryId ? { category: categoryId } : {}),
            getAcknowledgementCopy: false,
        };
        const res = await this.post('/partner/booking/create-booking/', body);
        if (!res.ok)
            return res;
        const data = res.data;
        const booking = data?.data?.booking;
        if (!booking?._id && !booking?.id) {
            return {
                ok: false,
                error: 'AAJ create-booking returned no booking id',
                raw: data,
            };
        }
        return {
            ok: true,
            data: {
                bookingId: String(booking._id ?? booking.id),
                humanizedName: String(booking.humanizedName ?? ''),
                totalNgn: Number(booking.totalAmount ?? 0),
                shippingFeeNgn: Number(booking.shippingFee ?? 0),
                raw: booking,
            },
        };
    }
    async processBooking(bookingId) {
        if (!this.isLive) {
            const trackingId = `STUB${Date.now().toString(36).toUpperCase()}`;
            return {
                ok: true,
                data: {
                    trackingId,
                    labelUrl: `https://stub.aajexpress.example/labels/${trackingId}.pdf`,
                    raw: { stub: true, bookingId },
                },
            };
        }
        const res = await this.post(`/partner/booking/process-booking/${encodeURIComponent(bookingId)}`, {});
        if (!res.ok)
            return res;
        const data = res.data;
        const shipment = data?.data?.payload?.shipment;
        if (!shipment?.tracking_id) {
            return {
                ok: false,
                error: 'AAJ process-booking returned no tracking id',
                raw: data,
            };
        }
        return {
            ok: true,
            data: {
                trackingId: shipment.tracking_id,
                labelUrl: shipment.labelDocuments?.[0],
                raw: shipment,
            },
        };
    }
    async trackShipment(trackingId) {
        if (!this.isLive) {
            const now = Date.now();
            const events = [
                {
                    dateTime: new Date(now - 2 * 86400 * 1000).toISOString(),
                    status: 0,
                    scanType: 'LABEL_CREATED',
                    description: 'Label documents have been created',
                    location: 'Online Branch',
                },
                {
                    dateTime: new Date(now - 1 * 86400 * 1000).toISOString(),
                    status: 1,
                    scanType: 'PICKED_UP',
                    description: 'Package picked up from sender',
                    location: 'Lagos Sorting Centre',
                },
                {
                    dateTime: new Date(now - 6 * 3600 * 1000).toISOString(),
                    status: 2,
                    scanType: 'IN_TRANSIT',
                    description: 'In transit',
                    location: 'Lagos Hub',
                },
            ];
            return {
                ok: true,
                data: {
                    trackingNumber: trackingId,
                    status: 2,
                    description: 'In transit',
                    etaDays: 2,
                    etaDate: new Date(now + 2 * 86400 * 1000).toISOString(),
                    events,
                    raw: { stub: true },
                },
            };
        }
        const res = await this.get(`/partner/shipment/track-shipment/${encodeURIComponent(trackingId)}`);
        if (!res.ok)
            return res;
        const data = res.data;
        const t = data?.data;
        if (!t) {
            return {
                ok: false,
                error: 'AAJ track-shipment returned no payload',
                raw: data,
            };
        }
        return {
            ok: true,
            data: {
                trackingNumber: t.trackingNumber ?? trackingId,
                status: Number(t.status ?? 0),
                description: t.description ?? '',
                etaDays: t.eta?.numberOfDays,
                etaDate: t.eta?.dateOfArrival,
                events: (t.events ?? []).map((e) => ({
                    dateTime: e.dateTime,
                    status: Number(e.meta?.status ?? 0),
                    scanType: e.scanType,
                    description: e.description,
                    location: e.meta?.location ?? '',
                })),
                raw: t,
            },
        };
    }
    prepareAddress(addr) {
        if (addr.countryCode?.toUpperCase() === 'NG' &&
            !addr.stateOrProvinceCode) {
            const code = (0, ng_state_codes_1.requireNgStateCode)(addr.state);
            return { ...addr, stateOrProvinceCode: code };
        }
        return addr;
    }
    addressForQuote(addr) {
        return {
            country: addr.country,
            countryCode: addr.countryCode.toUpperCase(),
            stateOrProvinceCode: (addr.stateOrProvinceCode ?? '').toUpperCase(),
            state: addr.state,
            postalCode: addr.postalCode,
            city: addr.city,
        };
    }
    addressForBooking(addr) {
        return {
            addressLine1: addr.addressLine1,
            ...(addr.addressLine2 ? { addressLine2: addr.addressLine2 } : {}),
            city: addr.city,
            state: addr.state,
            country: addr.country,
            countryCode: addr.countryCode.toUpperCase(),
            stateOrProvinceCode: (addr.stateOrProvinceCode ?? '').toUpperCase(),
            postalCode: addr.postalCode,
            ...(addr.landmark ? { landmark: addr.landmark } : {}),
        };
    }
    async post(path, body) {
        return this.send('POST', path, body);
    }
    async get(path) {
        return this.send('GET', path);
    }
    async send(method, path, body) {
        try {
            const res = await fetch(`${this.baseUrl}${path}`, {
                method,
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            });
            const text = await res.text();
            let parsed;
            try {
                parsed = text ? JSON.parse(text) : {};
            }
            catch {
                parsed = { raw: text };
            }
            if (!res.ok) {
                const message = parsed?.message ??
                    parsed?.error ??
                    `AAJ ${method} ${path} → ${res.status}`;
                const bodySnippet = (typeof parsed === 'string' ? parsed : JSON.stringify(parsed)).slice(0, 500);
                const upstream = res.status >= 502 && res.status <= 504;
                this.logger.warn(`AAJ ${method} ${path} failed (${res.status})${upstream ? ' [upstream/service-unavailable]' : ''}: ${message} | body: ${bodySnippet}`);
                return { ok: false, error: message, statusCode: res.status, raw: parsed };
            }
            return { ok: true, data: parsed };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            this.logger.error(`AAJ ${method} ${path} threw: ${message}`);
            return { ok: false, error: message };
        }
    }
};
exports.AajProvider = AajProvider;
exports.AajProvider = AajProvider = AajProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], AajProvider);
//# sourceMappingURL=aaj.provider.js.map