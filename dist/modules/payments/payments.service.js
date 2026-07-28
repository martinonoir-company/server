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
var PaymentsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const payment_provider_interface_1 = require("./interfaces/payment-provider.interface");
const moniepoint_provider_1 = require("./providers/moniepoint.provider");
const paystack_provider_1 = require("./providers/paystack.provider");
const stripe_provider_1 = require("./providers/stripe.provider");
const payment_entity_1 = require("./entities/payment.entity");
const order_entity_1 = require("../orders/entities/order.entity");
const agents_service_1 = require("../agents/agents.service");
const shipping_dispatch_service_1 = require("../shipping/shipping-dispatch.service");
const pos_gateway_1 = require("../realtime/pos.gateway");
let PaymentsService = PaymentsService_1 = class PaymentsService {
    constructor(moniepoint, paystack, stripe, paymentRepo, orderRepo, dataSource, agentsService, shippingDispatchService, posGateway) {
        this.moniepoint = moniepoint;
        this.paystack = paystack;
        this.stripe = stripe;
        this.paymentRepo = paymentRepo;
        this.orderRepo = orderRepo;
        this.dataSource = dataSource;
        this.agentsService = agentsService;
        this.shippingDispatchService = shippingDispatchService;
        this.posGateway = posGateway;
        this.logger = new common_1.Logger(PaymentsService_1.name);
        this.providers = new Map([
            [payment_provider_interface_1.PaymentProviderName.MONIEPOINT, moniepoint],
            [payment_provider_interface_1.PaymentProviderName.PAYSTACK, paystack],
            [payment_provider_interface_1.PaymentProviderName.STRIPE, stripe],
        ]);
    }
    resolveProvider(currency, preferred) {
        if (preferred) {
            const provider = this.providers.get(preferred);
            if (!provider)
                throw new common_1.BadRequestException(`Unknown provider: ${preferred}`);
            return provider;
        }
        if (currency === 'NGN')
            return this.paystack;
        return this.stripe;
    }
    async createProviderPayment(input, preferred) {
        const provider = this.resolveProvider(input.currency, preferred);
        return provider.createPayment(input);
    }
    async verifyProviderPayment(input) {
        const provider = this.providers.get(input.provider);
        if (!provider)
            throw new common_1.BadRequestException(`Unknown provider: ${input.provider}`);
        return provider.verifyPayment(input);
    }
    async refundProviderPayment(providerName, input) {
        const provider = this.providers.get(providerName);
        if (!provider)
            throw new common_1.BadRequestException(`Unknown provider: ${providerName}`);
        return provider.refund(input);
    }
    async record(input) {
        const existing = await this.paymentRepo.findOne({
            where: { merchantReference: input.merchantReference },
        });
        if (existing)
            return existing;
        const payment = this.paymentRepo.create({
            orderId: input.orderId,
            orderNumber: input.orderNumber,
            provider: input.provider,
            channel: input.channel,
            method: input.method,
            amount: input.amount,
            currency: input.currency,
            merchantReference: input.merchantReference,
            providerReference: input.providerReference ?? null,
            terminalSerial: input.terminalSerial ?? null,
            checkoutUrl: input.checkoutUrl ?? null,
            status: input.status ?? payment_entity_1.PaymentStatus.PENDING,
            createdBy: input.createdBy ?? null,
            paidAt: input.paidAt ?? null,
        });
        return this.paymentRepo.save(payment);
    }
    async findById(id) {
        const payment = await this.paymentRepo.findOne({ where: { id } });
        if (!payment)
            throw new common_1.NotFoundException(`Payment ${id} not found`);
        return payment;
    }
    async findByMerchantReference(ref) {
        return this.paymentRepo.findOne({ where: { merchantReference: ref } });
    }
    async findByOrder(orderId) {
        return this.paymentRepo.find({
            where: { orderId },
            order: { createdAt: 'ASC' },
        });
    }
    async applyProviderState(paymentId, next) {
        let orderJustPaidId = null;
        const saved = await this.dataSource.transaction(async (manager) => {
            const repo = manager.getRepository(payment_entity_1.Payment);
            const payment = await repo.findOne({ where: { id: paymentId } });
            if (!payment)
                throw new common_1.NotFoundException(`Payment ${paymentId} not found`);
            const terminal = [
                payment_entity_1.PaymentStatus.SUCCEEDED,
                payment_entity_1.PaymentStatus.FAILED,
                payment_entity_1.PaymentStatus.CANCELLED,
                payment_entity_1.PaymentStatus.REFUNDED,
            ];
            if (terminal.includes(payment.status) && payment.status !== next.status) {
                this.logger.warn(`Payment ${paymentId} is already ${payment.status}; ignoring transition to ${next.status}`);
                return payment;
            }
            payment.status = next.status;
            if (next.providerReference !== undefined)
                payment.providerReference = next.providerReference;
            if (next.gatewayResponse !== undefined)
                payment.gatewayResponse = next.gatewayResponse;
            if (next.failureReason !== undefined)
                payment.failureReason = next.failureReason;
            if (next.rawProviderData !== undefined)
                payment.rawProviderData = next.rawProviderData;
            if (next.status === payment_entity_1.PaymentStatus.SUCCEEDED && !payment.paidAt) {
                payment.paidAt = new Date();
            }
            const out = await repo.save(payment);
            if (next.status === payment_entity_1.PaymentStatus.SUCCEEDED) {
                const transitioned = await this.recomputeOrderPaid(manager, payment.orderId);
                if (transitioned)
                    orderJustPaidId = payment.orderId;
            }
            return out;
        });
        if (orderJustPaidId) {
            await this.fireOrderPaidHooks(orderJustPaidId);
        }
        return saved;
    }
    async attachWebhook(paymentId, body) {
        const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
        if (!payment)
            return;
        payment.rawWebhook = body;
        await this.paymentRepo.save(payment);
    }
    async recomputeOrderPaid(manager, orderId) {
        const orderRepo = manager.getRepository(order_entity_1.Order);
        const order = await orderRepo.findOne({ where: { id: orderId } });
        if (!order)
            return false;
        const row = await manager
            .getRepository(payment_entity_1.Payment)
            .createQueryBuilder('p')
            .select('COALESCE(SUM(p.amount), 0)', 'paid')
            .where('p.orderId = :orderId', { orderId })
            .andWhere('p.status = :s', { s: payment_entity_1.PaymentStatus.SUCCEEDED })
            .getRawOne();
        const paid = Number(row?.paid ?? 0);
        if (paid >= Number(order.grandTotal)) {
            if (order.status === order_entity_1.OrderStatus.DRAFT ||
                order.status === order_entity_1.OrderStatus.PENDING_PAYMENT) {
                order.status = order_entity_1.OrderStatus.PAID;
                order.paidAt = new Date();
                await orderRepo.save(order);
                return true;
            }
        }
        return false;
    }
    async fireOrderPaidHooks(orderId) {
        if (this.agentsService) {
            try {
                await this.agentsService.applyAttributionOnPaid(orderId);
            }
            catch (err) {
                this.logger.error(`Agent attribution failed for order ${orderId}: ${err.message}`);
            }
        }
        if (this.shippingDispatchService) {
            void this.shippingDispatchService
                .bookAndProcess(orderId)
                .catch((err) => this.logger.error(`Shipping dispatch threw for ${orderId}: ${err.message}`));
        }
        if (this.posGateway) {
            try {
                const order = await this.orderRepo.findOne({
                    where: { id: orderId },
                    relations: ['items'],
                });
                if (!order) {
                    this.logger.warn(`Dispatch alert: order ${orderId} not found`);
                    return;
                }
                const isStaffChannel = order.channel === 'POS' || order.channel === 'ADMIN';
                const needsDispatch = order.dispatchStatus === 'PENDING' ||
                    (!order.dispatchStatus && !order.shippingOptOut && !isStaffChannel);
                if (!needsDispatch || order.dispatchStatus === 'DISPATCHED') {
                    this.logger.debug(`Dispatch alert skipped for ${order.orderNumber} ` +
                        `(dispatchStatus=${order.dispatchStatus ?? 'null'}, ` +
                        `optOut=${order.shippingOptOut}, channel=${order.channel})`);
                    return;
                }
                if (order.dispatchStatus !== 'PENDING') {
                    order.dispatchStatus = 'PENDING';
                    await this.orderRepo.update(order.id, { dispatchStatus: 'PENDING' });
                }
                const addr = order.shippingAddress;
                this.posGateway.emitDispatchNew({
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    channel: order.channel,
                    currency: order.currency,
                    grandTotal: Number(order.grandTotal),
                    itemCount: (order.items ?? []).reduce((s, i) => s + (i.quantity ?? 0), 0),
                    customerName: addr
                        ? `${addr.firstName} ${addr.lastName}`.trim()
                        : (order.guestEmail ?? 'Customer'),
                    city: addr?.city,
                    state: addr?.state,
                    createdAt: (order.createdAt ?? new Date()).toISOString(),
                });
                this.logger.log(`Dispatch alert emitted for ${order.orderNumber} → dispatch room`);
            }
            catch (err) {
                this.logger.warn(`Dispatch alert emit failed for ${orderId} (non-fatal): ${err.message}`);
            }
        }
        else {
            this.logger.warn(`Dispatch alert: PosGateway not injected — no alert for ${orderId}`);
        }
    }
    async list(opts = {}) {
        const page = Math.max(1, Math.floor(opts.page ?? 1));
        const limit = Math.min(100, Math.max(1, Math.floor(opts.limit ?? 20)));
        const qb = this.paymentRepo
            .createQueryBuilder('p')
            .orderBy('p.createdAt', 'DESC');
        if (opts.status)
            qb.andWhere('p.status = :status', { status: opts.status });
        if (opts.channel)
            qb.andWhere('p.channel = :channel', { channel: opts.channel });
        if (opts.provider)
            qb.andWhere('p.provider = :provider', { provider: opts.provider });
        if (opts.search && opts.search.trim()) {
            const term = `%${opts.search.trim().toLowerCase()}%`;
            qb.andWhere('(LOWER(p.orderNumber) LIKE :term OR LOWER(p.merchantReference) LIKE :term OR LOWER(p.providerReference) LIKE :term)', { term });
        }
        qb.skip((page - 1) * limit).take(limit);
        const [items, total] = await qb.getManyAndCount();
        return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
    }
    async initiatePaystackPayment(input) {
        const { order } = input;
        const open = await this.paymentRepo.findOne({
            where: [
                { orderId: order.id, provider: payment_entity_1.PaymentProvider.PAYSTACK, status: payment_entity_1.PaymentStatus.PENDING },
                { orderId: order.id, provider: payment_entity_1.PaymentProvider.PAYSTACK, status: payment_entity_1.PaymentStatus.PROCESSING },
            ],
            order: { createdAt: 'DESC' },
        });
        if (open && open.checkoutUrl)
            return open;
        const merchantReference = `MN-${order.orderNumber}-${Date.now()}`;
        const amount = Number(order.grandTotal);
        const payment = await this.record({
            orderId: order.id,
            orderNumber: order.orderNumber,
            provider: payment_entity_1.PaymentProvider.PAYSTACK,
            channel: input.channel,
            method: payment_entity_1.PaymentMethodType.CARD,
            amount,
            currency: order.currency,
            merchantReference,
            status: payment_entity_1.PaymentStatus.PENDING,
        });
        const intent = await this.paystack.createPayment({
            orderId: order.id,
            orderNumber: order.orderNumber,
            amount,
            currency: order.currency,
            customerEmail: input.customerEmail,
            customerName: input.customerName,
            callbackUrl: input.callbackUrl,
            metadata: { merchantReference },
        });
        if (intent.status === payment_provider_interface_1.PaymentIntentStatus.FAILED || !intent.checkoutUrl) {
            await this.applyProviderState(payment.id, {
                status: payment_entity_1.PaymentStatus.FAILED,
                failureReason: intent.metadata?.['error'] ?? 'Failed to initialize payment',
                rawProviderData: intent.metadata ?? null,
            });
            throw new common_1.BadRequestException('Could not initialize payment. Please try again.');
        }
        payment.providerReference = intent.providerReference;
        payment.checkoutUrl = intent.checkoutUrl;
        payment.status = payment_entity_1.PaymentStatus.PROCESSING;
        return this.paymentRepo.save(payment);
    }
    async verifyAndReconcile(merchantReference) {
        const payment = await this.findByMerchantReference(merchantReference);
        if (!payment) {
            throw new common_1.NotFoundException(`No payment for reference ${merchantReference}`);
        }
        if (payment.status === payment_entity_1.PaymentStatus.SUCCEEDED ||
            payment.status === payment_entity_1.PaymentStatus.REFUNDED) {
            return payment;
        }
        const providerName = payment.provider === payment_entity_1.PaymentProvider.PAYSTACK
            ? payment_provider_interface_1.PaymentProviderName.PAYSTACK
            : payment.provider === payment_entity_1.PaymentProvider.MONIEPOINT
                ? payment_provider_interface_1.PaymentProviderName.MONIEPOINT
                : null;
        if (!providerName) {
            return payment;
        }
        const provider = this.providers.get(providerName);
        if (!provider)
            return payment;
        const verifyRef = payment.merchantReference;
        let intent;
        try {
            intent = await provider.verifyPayment({
                providerReference: verifyRef,
                provider: providerName,
            });
        }
        catch (err) {
            this.logger.error(`Verify failed for ${merchantReference}: ${err.message}`);
            return payment;
        }
        const nextStatus = PaymentsService_1.mapIntentStatus(intent.status);
        return this.applyProviderState(payment.id, {
            status: nextStatus,
            providerReference: intent.providerReference || payment.providerReference,
            gatewayResponse: intent.metadata?.['gatewayResponse'] ?? null,
            failureReason: nextStatus === payment_entity_1.PaymentStatus.FAILED
                ? (intent.metadata?.['gatewayResponse'] ?? 'Payment failed')
                : null,
            rawProviderData: intent.metadata ?? null,
        });
    }
    async recordCashPayment(input) {
        const merchantReference = `CASH-${input.order.orderNumber}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;
        const payment = await this.record({
            orderId: input.order.id,
            orderNumber: input.order.orderNumber,
            provider: payment_entity_1.PaymentProvider.CASH,
            channel: payment_entity_1.PaymentChannel.POS,
            method: payment_entity_1.PaymentMethodType.CASH,
            amount: input.amount,
            currency: input.order.currency,
            merchantReference,
            status: payment_entity_1.PaymentStatus.SUCCEEDED,
            createdBy: input.createdBy ?? null,
            paidAt: new Date(),
        });
        await this.applyProviderState(payment.id, {
            status: payment_entity_1.PaymentStatus.SUCCEEDED,
            gatewayResponse: 'Cash collected at POS',
        });
        return this.findById(payment.id);
    }
    async pushTerminalPayment(input) {
        const merchantReference = `POS-${input.order.orderNumber}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;
        const payment = await this.record({
            orderId: input.order.id,
            orderNumber: input.order.orderNumber,
            provider: payment_entity_1.PaymentProvider.MONIEPOINT,
            channel: payment_entity_1.PaymentChannel.POS,
            method: payment_entity_1.PaymentMethodType.CARD,
            amount: input.amount,
            currency: input.order.currency,
            merchantReference,
            terminalSerial: input.terminalSerial,
            status: payment_entity_1.PaymentStatus.PENDING,
            createdBy: input.createdBy ?? null,
        });
        const pushResult = await this.moniepoint.pushToTerminal({
            terminalSerial: input.terminalSerial,
            amount: input.amount,
            merchantReference,
        });
        if (pushResult.status === payment_provider_interface_1.PaymentIntentStatus.FAILED) {
            await this.applyProviderState(payment.id, {
                status: payment_entity_1.PaymentStatus.FAILED,
                failureReason: pushResult.message ?? 'Terminal push failed',
                rawProviderData: pushResult.raw ?? null,
            });
            throw new common_1.BadRequestException(pushResult.message ?? 'Could not start the card payment on the terminal.');
        }
        payment.providerReference = pushResult.transactionReference ?? null;
        payment.status = payment_entity_1.PaymentStatus.PROCESSING;
        payment.rawProviderData = pushResult.raw ?? null;
        return this.paymentRepo.save(payment);
    }
    static mapIntentStatus(s) {
        switch (s) {
            case payment_provider_interface_1.PaymentIntentStatus.SUCCEEDED:
                return payment_entity_1.PaymentStatus.SUCCEEDED;
            case payment_provider_interface_1.PaymentIntentStatus.FAILED:
                return payment_entity_1.PaymentStatus.FAILED;
            case payment_provider_interface_1.PaymentIntentStatus.CANCELLED:
                return payment_entity_1.PaymentStatus.CANCELLED;
            case payment_provider_interface_1.PaymentIntentStatus.PROCESSING:
            case payment_provider_interface_1.PaymentIntentStatus.REQUIRES_ACTION:
                return payment_entity_1.PaymentStatus.PROCESSING;
            case payment_provider_interface_1.PaymentIntentStatus.PENDING:
            default:
                return payment_entity_1.PaymentStatus.PENDING;
        }
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = PaymentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, typeorm_1.InjectRepository)(payment_entity_1.Payment)),
    __param(4, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(6, (0, common_1.Optional)()),
    __param(6, (0, common_1.Inject)((0, common_1.forwardRef)(() => agents_service_1.AgentsService))),
    __param(7, (0, common_1.Optional)()),
    __param(8, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [moniepoint_provider_1.MoniepointProvider,
        paystack_provider_1.PaystackProvider,
        stripe_provider_1.StripeProvider,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource,
        agents_service_1.AgentsService,
        shipping_dispatch_service_1.ShippingDispatchService,
        pos_gateway_1.PosGateway])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map