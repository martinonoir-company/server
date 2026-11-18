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
const ng_state_codes_1 = require("./ng-state-codes");
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
        this.NG_STATE_BASE = {
            Lagos: 250000,
            Ogun: 300000,
            Oyo: 350000,
            Osun: 350000,
            Ondo: 350000,
            Ekiti: 380000,
            Edo: 400000,
            Delta: 420000,
            Rivers: 420000,
            Bayelsa: 450000,
            'Cross River': 480000,
            'Akwa Ibom': 470000,
            Anambra: 430000,
            Enugu: 450000,
            Imo: 450000,
            Abia: 450000,
            Ebonyi: 470000,
            Kwara: 380000,
            Kogi: 400000,
            'Federal Capital Territory': 400000,
            Niger: 430000,
            Nasarawa: 450000,
            Benue: 470000,
            Plateau: 480000,
            Kaduna: 480000,
            Kano: 520000,
            Katsina: 540000,
            Jigawa: 560000,
            Kebbi: 560000,
            Sokoto: 580000,
            Zamfara: 560000,
            Bauchi: 560000,
            Gombe: 580000,
            Taraba: 600000,
            Adamawa: 620000,
            Yobe: 640000,
            Borno: 660000,
        };
        this.NG_PER_EXTRA_KG = 60000;
    }
    buildSenderAddress() {
        const state = process.env['AAJ_SENDER_STATE'] ?? 'Lagos';
        const resolved = (0, ng_state_codes_1.resolveNgState)(state);
        return {
            name: process.env['AAJ_SENDER_NAME'] ?? 'Martinonoir',
            phone: process.env['AAJ_SENDER_PHONE'] ?? '+2348038010651',
            email: process.env['AAJ_SENDER_EMAIL'] ?? 'mail@martinonoir.com',
            company: 'Martinonoir',
            addressLine1: process.env['AAJ_SENDER_LINE1'] ?? '1 Admiralty Way',
            city: process.env['AAJ_SENDER_CITY'] ?? 'Lekki',
            state: resolved?.name ?? state,
            stateOrProvinceCode: resolved?.code ?? 'LA',
            country: 'Nigeria',
            countryCode: 'NG',
            postalCode: process.env['AAJ_SENDER_POSTAL'] ?? '101233',
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
            const canonical = (0, ng_state_codes_1.resolveNgState)(input.state)?.name;
            const base = (canonical ? this.NG_STATE_BASE[canonical] : undefined) ??
                this.NG_ZONES['DEFAULT'];
            const extraKg = Math.max(0, Math.ceil(input.weightKg) - 1);
            const zoneRate = base + extraKg * this.NG_PER_EXTRA_KG;
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