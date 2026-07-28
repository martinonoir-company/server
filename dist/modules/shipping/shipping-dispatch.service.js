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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ShippingDispatchService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShippingDispatchService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const schedule_1 = require("@nestjs/schedule");
const order_entity_1 = require("../orders/entities/order.entity");
const branch_entity_1 = require("../branches/entities/branch.entity");
const user_entity_1 = require("../users/entities/user.entity");
const aaj_provider_1 = require("./aaj.provider");
let ShippingDispatchService = ShippingDispatchService_1 = class ShippingDispatchService {
    constructor(orderRepo, branchRepo, userRepo, aaj) {
        this.orderRepo = orderRepo;
        this.branchRepo = branchRepo;
        this.userRepo = userRepo;
        this.aaj = aaj;
        this.logger = new common_1.Logger(ShippingDispatchService_1.name);
    }
    async bookAndProcess(orderId) {
        const order = await this.orderRepo.findOne({ where: { id: orderId } });
        if (!order)
            return;
        if (order.shippingOptOut) {
            this.logger.debug(`Order ${order.orderNumber} opted out of shipping — skipping AAJ.`);
            return;
        }
        if (order.shippingTrackingId) {
            this.logger.debug(`Order ${order.orderNumber} already has tracking ${order.shippingTrackingId}.`);
            return;
        }
        const sender = await this.resolveSender(order);
        if (!sender) {
            await this.markFailure(order, 'No fulfilment branch configured.');
            return;
        }
        const receiver = await this.resolveReceiver(order);
        if (!receiver) {
            await this.markFailure(order, 'Order is missing a shipping address.');
            return;
        }
        let bookingId = order.shippingBookingId;
        if (!bookingId) {
            const items = await this.resolveItems(order);
            const weightKg = await this.resolveWeight(order);
            const created = await this.aaj.createBooking({
                customBookingId: order.orderNumber,
                sender,
                receiver,
                itemsValueNgn: Math.max(0, Math.round(Number(order.subtotal) / 100)),
                weightKg,
                items,
                description: `Martinonoir order ${order.orderNumber}`,
            });
            if (!created.ok) {
                await this.markFailure(order, `Create-booking: ${created.error}`);
                return;
            }
            bookingId = created.data.bookingId;
            await this.orderRepo.update(order.id, {
                shippingBookingId: bookingId,
                carrier: 'AAJ Express',
            });
        }
        const processed = await this.aaj.processBooking(bookingId);
        if (!processed.ok) {
            await this.markFailure(order, `Process-booking: ${processed.error}`);
            return;
        }
        await this.orderRepo
            .createQueryBuilder()
            .update(order_entity_1.Order)
            .set({
            shippingTrackingId: processed.data.trackingId,
            shippingLabelUrl: processed.data.labelUrl,
            shippingStatus: 0,
            shippingRetryCount: 0,
            shippingLastError: null,
            trackingNumber: processed.data.trackingId,
        })
            .where('id = :id', { id: order.id })
            .execute();
        this.logger.log(`Order ${order.orderNumber} shipped via AAJ ${processed.data.trackingId}.`);
    }
    async retryPending() {
        const stuck = await this.orderRepo
            .createQueryBuilder('o')
            .where('o."shippingOptOut" = false')
            .andWhere('o.status IN (:...statuses)', {
            statuses: ['PAID', 'PROCESSING'],
        })
            .andWhere('o."shippingTrackingId" IS NULL')
            .andWhere('o."shippingRetryCount" < :maxRetries', {
            maxRetries: ShippingDispatchService_1.MAX_RETRIES,
        })
            .andWhere(`(o."shippingLastTrackedAt" IS NULL ` +
            `OR o."shippingLastTrackedAt" < NOW() - (INTERVAL '1 minute' * POWER(2, o."shippingRetryCount")))`)
            .limit(10)
            .getMany();
        for (const order of stuck) {
            try {
                await this.bookAndProcess(order.id);
            }
            catch (err) {
                this.logger.error(`Retry failed for ${order.orderNumber}: ${err instanceof Error ? err.message : 'Unknown'}`);
            }
        }
    }
    async getTracking(orderId, opts = {}) {
        const order = await this.orderRepo.findOne({ where: { id: orderId } });
        if (!order)
            throw new common_1.NotFoundException(`Order ${orderId} not found`);
        if (order.shippingOptOut) {
            return {
                trackingNumber: null,
                status: null,
                description: 'Customer opted out of shipping.',
                events: [],
                optedOut: true,
                pending: false,
            };
        }
        if (!order.shippingTrackingId) {
            return {
                trackingNumber: null,
                status: null,
                description: order.shippingLastError
                    ? `Shipping setup pending — ${order.shippingLastError}`
                    : 'Shipping setup is in progress.',
                events: [],
                optedOut: false,
                pending: true,
                lastError: order.shippingLastError ?? null,
            };
        }
        const cached = order.shippingLastTrackedAt &&
            Date.now() - order.shippingLastTrackedAt.getTime() <
                ShippingDispatchService_1.TRACKING_CACHE_TTL_MS;
        if (cached && !opts.force) {
            return {
                trackingNumber: order.shippingTrackingId,
                status: order.shippingStatus ?? 0,
                description: this.statusLabel(order.shippingStatus),
                events: order.shippingEvents ?? [],
                labelUrl: order.shippingLabelUrl ?? null,
                optedOut: false,
                pending: false,
            };
        }
        const res = await this.aaj.trackShipment(order.shippingTrackingId);
        if (!res.ok) {
            return {
                trackingNumber: order.shippingTrackingId,
                status: order.shippingStatus ?? 0,
                description: order.shippingEvents?.length
                    ? this.statusLabel(order.shippingStatus)
                    : 'Tracking momentarily unavailable. Try again shortly.',
                events: order.shippingEvents ?? [],
                labelUrl: order.shippingLabelUrl ?? null,
                optedOut: false,
                pending: false,
            };
        }
        await this.orderRepo.update(order.id, {
            shippingStatus: res.data.status,
            shippingEvents: res.data.events,
            shippingLastTrackedAt: new Date(),
        });
        return {
            trackingNumber: res.data.trackingNumber,
            status: res.data.status,
            description: res.data.description || this.statusLabel(res.data.status),
            etaDays: res.data.etaDays,
            etaDate: res.data.etaDate,
            events: res.data.events,
            labelUrl: order.shippingLabelUrl ?? null,
            optedOut: false,
            pending: false,
        };
    }
    async markFailure(order, message) {
        const next = (order.shippingRetryCount ?? 0) + 1;
        await this.orderRepo.update(order.id, {
            shippingRetryCount: next,
            shippingLastError: message,
            shippingLastTrackedAt: new Date(),
        });
        this.logger.warn(`Order ${order.orderNumber} shipping failure #${next}: ${message}`);
    }
    async resolveSender(order) {
        let branch = null;
        if (order.branchId) {
            branch = await this.branchRepo.findOne({ where: { id: order.branchId } });
        }
        if (!branch) {
            const defaultId = process.env['AAJ_DEFAULT_BRANCH_ID'] ?? '';
            if (defaultId) {
                branch = await this.branchRepo.findOne({ where: { id: defaultId } });
            }
        }
        if (!branch) {
            branch = await this.branchRepo.findOne({
                where: { isActive: true },
            });
        }
        if (!branch?.address)
            return null;
        const addr = branch.address;
        return {
            name: process.env['AAJ_SENDER_NAME'] ?? branch.name,
            phone: branch.phone ?? process.env['AAJ_SENDER_PHONE'] ?? '+2348000000000',
            email: process.env['AAJ_SENDER_EMAIL'] ?? 'support@martinonoir.com',
            company: 'Martinonoir',
            addressLine1: addr.line1 ?? '',
            addressLine2: addr.line2 ?? undefined,
            city: addr.city ?? '',
            state: addr.state ?? '',
            country: 'Nigeria',
            countryCode: (addr.countryCode ?? 'NG').toUpperCase(),
            postalCode: addr.postalCode ?? '100001',
        };
    }
    async resolveReceiver(order) {
        if (!order.shippingAddress)
            return null;
        const a = order.shippingAddress;
        const cc = a.country.length === 2 ? a.country.toUpperCase() : 'NG';
        const countryName = cc === 'NG' ? 'Nigeria' : a.country;
        const user = order.userId
            ? await this.userRepo.findOne({ where: { id: order.userId } })
            : null;
        const email = user?.email ?? order.guestEmail ?? '';
        return {
            name: `${a.firstName} ${a.lastName}`.trim(),
            phone: a.phone ?? '+2348000000000',
            email: email || 'noreply@martinonoir.com',
            addressLine1: a.line1,
            addressLine2: a.line2,
            city: a.city,
            state: a.state,
            country: countryName,
            countryCode: cc,
            postalCode: a.postalCode ?? '100001',
        };
    }
    async resolveItems(order) {
        const items = await this.orderRepo.manager
            .createQueryBuilder()
            .select(['oi.productName AS name', 'oi.quantity AS qty', 'oi.unitPrice AS price'])
            .from('order_items', 'oi')
            .where('oi."orderId" = :id', { id: order.id })
            .getRawMany();
        if (items.length === 0) {
            return [
                { name: order.orderNumber, quantity: 1, price: 0 },
            ];
        }
        return items.map((i) => ({
            name: i.name,
            quantity: Number(i.qty),
            price: Math.round(Number(i.price) / 100),
            unitMeasurement: 'EA',
            excludePackingList: false,
        }));
    }
    async resolveWeight(order) {
        const perUnit = Number(process.env['AAJ_DEFAULT_KG_PER_UNIT'] ?? '0.5');
        const count = await this.orderRepo.manager
            .createQueryBuilder()
            .select('COALESCE(SUM(oi.quantity), 1)', 'total')
            .from('order_items', 'oi')
            .where('oi."orderId" = :id', { id: order.id })
            .getRawOne();
        const units = Number(count?.total ?? 1);
        return Math.max(0.5, Math.round(units * perUnit * 10) / 10);
    }
    statusLabel(status) {
        switch (status) {
            case 0:
                return 'Label created';
            case 1:
                return 'Picked up';
            case 2:
                return 'In transit';
            case 3:
                return 'Out for delivery';
            case 4:
                return 'Delivered';
            default:
                return 'Shipping setup pending';
        }
    }
};
exports.ShippingDispatchService = ShippingDispatchService;
ShippingDispatchService.TRACKING_CACHE_TTL_MS = 60_000;
ShippingDispatchService.MAX_RETRIES = 8;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_MINUTE),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ShippingDispatchService.prototype, "retryPending", null);
exports.ShippingDispatchService = ShippingDispatchService = ShippingDispatchService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(1, (0, typeorm_1.InjectRepository)(branch_entity_1.Branch)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        aaj_provider_1.AajProvider])
], ShippingDispatchService);
//# sourceMappingURL=shipping-dispatch.service.js.map