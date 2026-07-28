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
var RefundsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefundsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const refund_request_entity_1 = require("./entities/refund-request.entity");
const order_entity_1 = require("../orders/entities/order.entity");
const payment_entity_1 = require("../payments/entities/payment.entity");
const inventory_service_1 = require("../inventory/inventory.service");
const inventory_entity_1 = require("../inventory/entities/inventory.entity");
const paystack_provider_1 = require("../payments/providers/paystack.provider");
const agents_service_1 = require("../agents/agents.service");
let RefundsService = RefundsService_1 = class RefundsService {
    constructor(refundRepo, itemRepo, orderRepo, orderItemRepo, paymentRepo, movementRepo, inventoryService, paystack, dataSource, agentsService) {
        this.refundRepo = refundRepo;
        this.itemRepo = itemRepo;
        this.orderRepo = orderRepo;
        this.orderItemRepo = orderItemRepo;
        this.paymentRepo = paymentRepo;
        this.movementRepo = movementRepo;
        this.inventoryService = inventoryService;
        this.paystack = paystack;
        this.dataSource = dataSource;
        this.agentsService = agentsService;
        this.logger = new common_1.Logger(RefundsService_1.name);
    }
    async lookupOrderForReturn(orderNumber) {
        const order = await this.orderRepo.findOne({
            where: { orderNumber: orderNumber.trim().toUpperCase() },
            relations: { items: true, user: true },
        });
        if (!order)
            throw new common_1.NotFoundException(`Order ${orderNumber} not found`);
        return {
            id: order.id,
            orderNumber: order.orderNumber,
            channel: order.channel,
            status: order.status,
            grandTotal: Number(order.grandTotal),
            currency: order.currency,
            customerName: order.user
                ? `${order.user.firstName ?? ''} ${order.user.lastName ?? ''}`.trim()
                : (order.shippingAddress
                    ? `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`
                    : null),
            customerPhone: order.user?.phone ?? order.shippingAddress?.phone ?? null,
            paidAt: order.paidAt ?? null,
            items: order.items?.map((i) => ({
                id: i.id,
                variantId: i.variantId,
                productName: i.productName,
                variantName: i.variantName,
                sku: i.sku,
                quantity: i.quantity,
                unitPrice: Number(i.unitPrice),
            })) ?? [],
        };
    }
    async createFromReturn(input) {
        const order = await this.orderRepo.findOne({
            where: { id: input.orderId },
            relations: { items: true },
        });
        if (!order)
            throw new common_1.NotFoundException(`Order ${input.orderId} not found`);
        const refundableStatuses = [
            order_entity_1.OrderStatus.PAID,
            order_entity_1.OrderStatus.PROCESSING,
            order_entity_1.OrderStatus.SHIPPED,
            order_entity_1.OrderStatus.DELIVERED,
            order_entity_1.OrderStatus.RETURN_REQUESTED,
            order_entity_1.OrderStatus.RETURN_APPROVED,
            order_entity_1.OrderStatus.RETURNED,
        ];
        if (!refundableStatuses.includes(order.status)) {
            throw new common_1.BadRequestException(`Order ${order.orderNumber} is ${order.status}; nothing to refund.`);
        }
        const itemsByVariant = new Map(order.items?.map((i) => [i.variantId, i]));
        let computedTotalMinor = 0;
        let totalUnits = 0;
        const itemRows = [];
        for (const line of input.lines) {
            const oi = itemsByVariant.get(line.variantId);
            if (!oi) {
                throw new common_1.BadRequestException(`Variant ${line.variantId} was not on order ${order.orderNumber}.`);
            }
            if (line.quantity <= 0 || line.quantity > oi.quantity) {
                throw new common_1.BadRequestException(`Returning ${line.quantity} of ${oi.productName} exceeds ordered quantity (${oi.quantity}).`);
            }
            const lineTotal = Number(oi.unitPrice) * line.quantity;
            computedTotalMinor += lineTotal;
            totalUnits += line.quantity;
            itemRows.push({
                orderItemId: oi.id,
                variantId: oi.variantId,
                productName: oi.productName,
                variantName: oi.variantName,
                sku: oi.sku,
                quantity: line.quantity,
                unitPrice: Number(oi.unitPrice),
                lineTotal,
                reasonCode: line.reasonCode,
                reasonNote: line.reasonNote,
            });
        }
        let totalRefundMinor;
        if (input.customAmount && input.customAmount > 0) {
            const orderTotal = Number(order.grandTotal);
            if (input.customAmount > orderTotal) {
                throw new common_1.BadRequestException(`Refund amount (${input.customAmount}) exceeds order total (${orderTotal}).`);
            }
            totalRefundMinor = Math.round(input.customAmount);
        }
        else if (input.lines.length === 0) {
            throw new common_1.BadRequestException('Either scan items or provide a refund amount.');
        }
        else {
            totalRefundMinor = computedTotalMinor;
        }
        const payments = await this.paymentRepo.find({
            where: { orderId: order.id, status: payment_entity_1.PaymentStatus.SUCCEEDED },
            order: { amount: 'DESC' },
        });
        const originalPayment = payments[0] ?? null;
        const channel = (order.channel === order_entity_1.OrderChannel.POS
            ? payment_entity_1.PaymentChannel.POS
            : order.channel === order_entity_1.OrderChannel.STOREFRONT
                ? payment_entity_1.PaymentChannel.STOREFRONT
                : payment_entity_1.PaymentChannel.MOBILE);
        let method;
        let status = refund_request_entity_1.RefundStatus.PENDING;
        if (input.posCashRefund) {
            if (order.channel !== order_entity_1.OrderChannel.POS) {
                throw new common_1.BadRequestException('Cash refund is only allowed for POS orders.');
            }
            method = refund_request_entity_1.RefundMethod.CASH;
            status = refund_request_entity_1.RefundStatus.COMPLETED_BY_STAFF;
        }
        else if (input.bankDetails) {
            method = refund_request_entity_1.RefundMethod.PAYSTACK_TRANSFER;
        }
        else if (originalPayment?.provider === payment_entity_1.PaymentProvider.PAYSTACK &&
            originalPayment?.providerReference) {
            method = refund_request_entity_1.RefundMethod.PAYSTACK_REFUND;
        }
        else {
            throw new common_1.BadRequestException('This order requires bank details for a Paystack transfer refund. Capture and verify the customer account, then resubmit.');
        }
        const refund = await this.dataSource.transaction(async (manager) => {
            const created = manager.create(refund_request_entity_1.RefundRequest, {
                orderId: order.id,
                originalPaymentId: originalPayment?.id ?? null,
                channel,
                amount: totalRefundMinor,
                currency: order.currency,
                itemsCount: totalUnits,
                status,
                method,
                reason: input.reason,
                requestedBy: input.createdBy,
                bankCode: input.bankDetails?.bankCode ?? null,
                bankAccountNumber: input.bankDetails?.accountNumber ?? null,
                bankAccountName: input.bankDetails?.accountName ?? null,
            });
            const savedRefund = await manager.save(refund_request_entity_1.RefundRequest, created);
            for (let i = 0; i < input.lines.length; i++) {
                const line = input.lines[i];
                const itemRow = itemRows[i];
                const { movement } = await this.inventoryService.recordMovementOnManager(manager, {
                    variantId: line.variantId,
                    kind: inventory_entity_1.MovementKind.RETURN,
                    quantity: line.quantity,
                    warehouseCode: input.warehouseCode ?? 'DEFAULT',
                    referenceId: order.id,
                    referenceType: 'CUSTOMER_RETURN',
                    reason: line.reasonNote
                        ? `${line.reasonCode ?? 'Return'} — ${line.reasonNote}`
                        : line.reasonCode ?? 'Return',
                    createdBy: input.createdBy,
                    clientLineId: line.clientLineId,
                });
                await manager.save(refund_request_entity_1.RefundRequestItem, manager.create(refund_request_entity_1.RefundRequestItem, {
                    ...itemRow,
                    refundRequestId: savedRefund.id,
                    stockMovementId: movement.id,
                }));
            }
            if (status === refund_request_entity_1.RefundStatus.COMPLETED_BY_STAFF) {
                await manager.update(order_entity_1.Order, { id: order.id }, { status: order_entity_1.OrderStatus.REFUNDED });
            }
            return savedRefund;
        });
        this.logger.log(`Created refund ${refund.id} for order ${order.orderNumber}: ` +
            `${refund.amount} ${refund.currency} via ${refund.method} (${refund.status})`);
        return this.findById(refund.id);
    }
    async list(opts) {
        const page = Math.max(1, opts.page ?? 1);
        const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
        const qb = this.refundRepo
            .createQueryBuilder('r')
            .leftJoinAndSelect('r.order', 'o')
            .orderBy('r.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);
        if (opts.status)
            qb.andWhere('r.status = :status', { status: opts.status });
        if (opts.channel)
            qb.andWhere('r.channel = :channel', { channel: opts.channel });
        if (opts.search) {
            qb.andWhere('o."orderNumber" ILIKE :s', { s: `%${opts.search}%` });
        }
        const [items, total] = await qb.getManyAndCount();
        return {
            items,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
        };
    }
    async findById(id) {
        const r = await this.refundRepo.findOne({
            where: { id },
            relations: { order: true, originalPayment: true, items: true },
        });
        if (!r)
            throw new common_1.NotFoundException(`Refund ${id} not found`);
        return r;
    }
    async approve(id, decidedBy, amountOverride) {
        const r = await this.findById(id);
        if (r.status !== refund_request_entity_1.RefundStatus.PENDING) {
            throw new common_1.BadRequestException(`Refund is ${r.status}; only PENDING can be approved.`);
        }
        if (amountOverride && amountOverride > 0) {
            const orderTotal = Number(r.order?.grandTotal ?? 0);
            if (orderTotal > 0 && amountOverride > orderTotal) {
                throw new common_1.BadRequestException(`Refund amount (${amountOverride}) exceeds order total (${orderTotal}).`);
            }
            r.amount = Math.round(amountOverride);
        }
        r.decidedBy = decidedBy;
        r.decidedAt = new Date();
        r.status = refund_request_entity_1.RefundStatus.APPROVED;
        await this.refundRepo.save(r);
        return this.execute(r.id);
    }
    async reject(id, decidedBy, decisionReason) {
        const r = await this.findById(id);
        if (r.status !== refund_request_entity_1.RefundStatus.PENDING) {
            throw new common_1.BadRequestException(`Refund is ${r.status}; only PENDING can be rejected.`);
        }
        r.decidedBy = decidedBy;
        r.decidedAt = new Date();
        r.decisionReason = decisionReason ?? null;
        r.status = refund_request_entity_1.RefundStatus.REJECTED;
        await this.refundRepo.save(r);
        return this.findById(id);
    }
    async execute(id) {
        const r = await this.findById(id);
        if (r.status !== refund_request_entity_1.RefundStatus.APPROVED &&
            r.status !== refund_request_entity_1.RefundStatus.FAILED) {
            throw new common_1.BadRequestException(`Cannot execute refund in status ${r.status}.`);
        }
        r.status = refund_request_entity_1.RefundStatus.PROCESSING;
        r.failureReason = null;
        await this.refundRepo.save(r);
        try {
            if (r.method === refund_request_entity_1.RefundMethod.PAYSTACK_REFUND) {
                if (!r.originalPayment?.providerReference) {
                    throw new Error('Original Paystack reference missing on this order.');
                }
                const res = await this.paystack.refund({
                    providerReference: r.originalPayment.providerReference,
                    amount: Number(r.amount),
                });
                r.providerReference = res.refundReference;
                r.rawProviderData = res;
                await this.refundRepo.save(r);
                return this.findById(id);
            }
            if (r.method === refund_request_entity_1.RefundMethod.PAYSTACK_TRANSFER) {
                if (!r.bankCode ||
                    !r.bankAccountNumber ||
                    !r.bankAccountName) {
                    throw new Error('Bank details are required for a transfer refund.');
                }
                let recipientCode = r.transferRecipientCode;
                if (!recipientCode) {
                    const recipient = await this.paystack.createTransferRecipient({
                        accountNumber: r.bankAccountNumber,
                        bankCode: r.bankCode,
                        accountName: r.bankAccountName,
                    });
                    if ('error' in recipient)
                        throw new Error(recipient.error);
                    recipientCode = recipient.recipientCode;
                    r.transferRecipientCode = recipientCode;
                }
                const transfer = await this.paystack.initiateTransfer({
                    recipientCode,
                    amount: Number(r.amount),
                    reason: `Refund for order ${r.order?.orderNumber ?? r.orderId}`,
                    reference: `RF-${r.id}`,
                });
                if ('error' in transfer)
                    throw new Error(transfer.error);
                r.providerReference = transfer.providerReference;
                r.rawProviderData = transfer;
                if (transfer.status === 'SUCCEEDED') {
                    r.status = refund_request_entity_1.RefundStatus.SUCCEEDED;
                    r.refundedAt = new Date();
                    await this.markOrderRefunded(r.orderId);
                }
                await this.refundRepo.save(r);
                return this.findById(id);
            }
            throw new Error(`Unsupported refund method ${r.method}`);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            r.status = refund_request_entity_1.RefundStatus.FAILED;
            r.failureReason = message;
            await this.refundRepo.save(r);
            this.logger.error(`Refund ${id} failed: ${message}`);
            return this.findById(id);
        }
    }
    async settleByProviderReference(providerReference, outcome, raw, failureReason) {
        const r = await this.refundRepo.findOne({
            where: { providerReference },
        });
        if (!r)
            return null;
        if (r.status === refund_request_entity_1.RefundStatus.SUCCEEDED ||
            r.status === refund_request_entity_1.RefundStatus.REJECTED) {
            return r;
        }
        r.status =
            outcome === 'SUCCEEDED' ? refund_request_entity_1.RefundStatus.SUCCEEDED : refund_request_entity_1.RefundStatus.FAILED;
        if (outcome === 'SUCCEEDED') {
            r.refundedAt = new Date();
            await this.markOrderRefunded(r.orderId);
        }
        else {
            r.failureReason = failureReason ?? 'Provider reported failure';
        }
        r.rawProviderData = { ...(r.rawProviderData ?? {}), settle: raw };
        return this.refundRepo.save(r);
    }
    async totalsRefunded(from, to) {
        const row = await this.refundRepo
            .createQueryBuilder('r')
            .select('COALESCE(SUM(r.amount), 0)', 'amountNgn')
            .addSelect('COALESCE(SUM(r."itemsCount"), 0)', 'itemsCount')
            .addSelect('COUNT(*)::int', 'requestsCount')
            .where('r.status IN (:...statuses)', {
            statuses: [refund_request_entity_1.RefundStatus.SUCCEEDED, refund_request_entity_1.RefundStatus.COMPLETED_BY_STAFF],
        })
            .andWhere('r.currency = :ngn', { ngn: 'NGN' })
            .andWhere('r."createdAt" BETWEEN :from AND :to', { from, to })
            .getRawOne();
        return {
            amountNgn: Number(row?.amountNgn ?? 0),
            itemsCount: Number(row?.itemsCount ?? 0),
            requestsCount: Number(row?.requestsCount ?? 0),
        };
    }
    async markOrderRefunded(orderId) {
        await this.orderRepo.update({ id: orderId }, { status: order_entity_1.OrderStatus.REFUNDED });
        if (this.agentsService) {
            await this.agentsService.reverseAttributionOnRefund(orderId);
        }
    }
};
exports.RefundsService = RefundsService;
exports.RefundsService = RefundsService = RefundsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(refund_request_entity_1.RefundRequest)),
    __param(1, (0, typeorm_1.InjectRepository)(refund_request_entity_1.RefundRequestItem)),
    __param(2, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(3, (0, typeorm_1.InjectRepository)(order_entity_1.OrderItem)),
    __param(4, (0, typeorm_1.InjectRepository)(payment_entity_1.Payment)),
    __param(5, (0, typeorm_1.InjectRepository)(inventory_entity_1.StockMovement)),
    __param(9, (0, common_1.Optional)()),
    __param(9, (0, common_1.Inject)((0, common_1.forwardRef)(() => agents_service_1.AgentsService))),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        inventory_service_1.InventoryService,
        paystack_provider_1.PaystackProvider,
        typeorm_2.DataSource,
        agents_service_1.AgentsService])
], RefundsService);
//# sourceMappingURL=refunds.service.js.map