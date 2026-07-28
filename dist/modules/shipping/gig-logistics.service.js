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
var GigLogisticsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GigLogisticsService = void 0;
const common_1 = require("@nestjs/common");
const base_entity_1 = require("../../shared/entities/base.entity");
let GigLogisticsService = GigLogisticsService_1 = class GigLogisticsService {
    constructor() {
        this.logger = new common_1.Logger(GigLogisticsService_1.name);
        this.apiKey = process.env['GIG_API_KEY'] ?? '';
        this.baseUrl = process.env['GIG_BASE_URL'] ?? 'https://giglogisticsapi.com/api/v1';
        this.isLive = !!this.apiKey;
        if (!this.isLive) {
            this.logger.warn('GIG_API_KEY not set — running in stub mode');
        }
    }
    async createShipment(input) {
        this.logger.log(`Creating shipment for order ${input.orderNumber}`);
        if (!this.isLive) {
            const trackingNumber = `GIG${Date.now().toString(36).toUpperCase()}${(0, base_entity_1.generateUlid)().slice(-4)}`;
            return {
                trackingNumber,
                carrier: 'GIG Logistics',
                estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: 'BOOKED',
                providerReference: `STUB-${(0, base_entity_1.generateUlid)()}`,
            };
        }
        try {
            const res = await fetch(`${this.baseUrl}/shipments`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    SenderAddress: input.senderAddress.line1,
                    SenderCity: input.senderAddress.city,
                    SenderState: input.senderAddress.state,
                    ReceiverName: `${input.recipientAddress.firstName} ${input.recipientAddress.lastName}`,
                    ReceiverAddress: input.recipientAddress.line1,
                    ReceiverCity: input.recipientAddress.city,
                    ReceiverState: input.recipientAddress.state,
                    ReceiverPhoneNumber: input.recipientAddress.phone ?? '',
                    Weight: input.packageDetails.weightKg,
                    PaymentType: 'Prepaid',
                    Description: input.packageDetails.description,
                    Value: input.packageDetails.value / 100,
                    DeliveryType: 'Normal',
                }),
            });
            const data = await res.json();
            return {
                trackingNumber: data.WaybillNumber ?? `GIG-${(0, base_entity_1.generateUlid)().slice(-8)}`,
                carrier: 'GIG Logistics',
                estimatedDelivery: data.EstimatedDeliveryDate ?? new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: 'BOOKED',
                providerReference: data.ShipmentId?.toString(),
                labelUrl: data.LabelUrl,
            };
        }
        catch (err) {
            this.logger.error(`GIG shipment creation failed: ${err instanceof Error ? err.message : 'Unknown'}`);
            return {
                trackingNumber: '',
                carrier: 'GIG Logistics',
                estimatedDelivery: '',
                status: 'FAILED',
            };
        }
    }
    async trackShipment(trackingNumber) {
        this.logger.log(`Tracking shipment: ${trackingNumber}`);
        if (!this.isLive) {
            const now = new Date();
            return {
                trackingNumber,
                carrier: 'GIG Logistics',
                currentStatus: 'IN_TRANSIT',
                events: [
                    {
                        timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                        status: 'PICKED_UP',
                        location: 'Lagos Sorting Center',
                        description: 'Package picked up from sender',
                    },
                    {
                        timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                        status: 'IN_TRANSIT',
                        location: 'Lagos Hub',
                        description: 'Package in transit to destination',
                    },
                ],
            };
        }
        try {
            const res = await fetch(`${this.baseUrl}/shipments/track/${trackingNumber}`, {
                headers: { 'Authorization': `Bearer ${this.apiKey}` },
            });
            const data = await res.json();
            return {
                trackingNumber,
                carrier: 'GIG Logistics',
                currentStatus: data.ShipmentStatus ?? 'UNKNOWN',
                events: (data.ShipmentTrackingEvents ?? []).map((e) => ({
                    timestamp: e['EventDate'] ?? '',
                    status: e['Status'] ?? '',
                    location: e['Location'] ?? '',
                    description: e['EventDescription'] ?? '',
                })),
            };
        }
        catch {
            return {
                trackingNumber,
                carrier: 'GIG Logistics',
                currentStatus: 'UNKNOWN',
                events: [],
            };
        }
    }
};
exports.GigLogisticsService = GigLogisticsService;
exports.GigLogisticsService = GigLogisticsService = GigLogisticsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], GigLogisticsService);
//# sourceMappingURL=gig-logistics.service.js.map