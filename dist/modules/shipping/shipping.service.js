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
var ShippingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShippingService = void 0;
const common_1 = require("@nestjs/common");
const aaj_provider_1 = require("./aaj.provider");
let ShippingService = ShippingService_1 = class ShippingService {
    constructor(aaj) {
        this.aaj = aaj;
        this.logger = new common_1.Logger(ShippingService_1.name);
        this.NG_ZONES = {
            Lagos: 250000,
            Abuja: 350000,
            Rivers: 400000,
            Ogun: 300000,
            Oyo: 350000,
            DEFAULT: 500000,
        };
    }
    async calculateRates(input) {
        if (input.recipient && input.sender) {
            try {
                const res = await this.aaj.getQuote({
                    sender: input.sender,
                    receiver: input.recipient,
                    itemsValueNgn: input.itemsValueNgn ??
                        Math.max(0, Math.round(input.subtotal / 100)),
                    weightKg: Math.max(0.1, input.weightKg),
                    items: input.items,
                    deliveryMode: 'DOOR_STEP',
                });
                if (res.ok) {
                    return [
                        {
                            carrier: 'AAJ Express',
                            service: 'Door delivery',
                            estimatedDays: { min: res.data.etaDays, max: res.data.etaDays + 2 },
                            rate: Math.round(res.data.totalNgn * 100),
                            currency: 'NGN',
                            quoteId: res.data.bookingId,
                            expiresAt: res.data.expiresAt,
                        },
                    ];
                }
                this.logger.warn(`AAJ quote failed: ${res.error} — using fallback.`);
            }
            catch (err) {
                this.logger.error(`AAJ quote threw: ${err instanceof Error ? err.message : 'Unknown'}`);
            }
        }
        return this.fallbackRates(input);
    }
    fallbackRates(input) {
        const rates = [];
        if (input.country === 'NG') {
            const zoneRate = this.NG_ZONES[input.state] ?? this.NG_ZONES['DEFAULT'];
            rates.push({
                carrier: 'AAJ Express',
                service: 'Door delivery (estimate)',
                estimatedDays: { min: 3, max: 7 },
                rate: zoneRate,
                currency: 'NGN',
            });
            rates.push({
                carrier: 'AAJ Express',
                service: 'Express (estimate)',
                estimatedDays: { min: 1, max: 3 },
                rate: Math.round(zoneRate * 1.8),
                currency: 'NGN',
            });
        }
        else {
            const baseRate = input.currency === 'USD' ? 2500 : 1500000;
            const perKg = input.currency === 'USD' ? 500 : 300000;
            const intlRate = baseRate + Math.ceil(input.weightKg) * perKg;
            rates.push({
                carrier: 'AAJ Express',
                service: 'International (estimate)',
                estimatedDays: { min: 10, max: 21 },
                rate: intlRate,
                currency: input.currency,
            });
        }
        return rates;
    }
};
exports.ShippingService = ShippingService;
exports.ShippingService = ShippingService = ShippingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [aaj_provider_1.AajProvider])
], ShippingService);
//# sourceMappingURL=shipping.service.js.map