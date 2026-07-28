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
var PosSyncService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PosSyncService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const inventory_service_1 = require("../inventory/inventory.service");
const inventory_entity_1 = require("../inventory/entities/inventory.entity");
const order_entity_1 = require("../orders/entities/order.entity");
const product_entity_1 = require("../products/entities/product.entity");
const pos_sync_job_entity_1 = require("./entities/pos-sync-job.entity");
const order_number_util_1 = require("../orders/order-number.util");
const payments_service_1 = require("../payments/payments.service");
const payment_entity_1 = require("../payments/entities/payment.entity");
const coupons_service_1 = require("../coupons/coupons.service");
const coupon_entity_1 = require("../coupons/entities/coupon.entity");
const SPLIT_TO_PAYMENT = {
    CASH: { provider: payment_entity_1.PaymentProvider.CASH, method: payment_entity_1.PaymentMethodType.CASH },
    POS_TERMINAL: {
        provider: payment_entity_1.PaymentProvider.MONIEPOINT,
        method: payment_entity_1.PaymentMethodType.CARD,
    },
    BANK_TRANSFER: {
        provider: payment_entity_1.PaymentProvider.CASH,
        method: payment_entity_1.PaymentMethodType.BANK_TRANSFER,
    },
};
const PAYMENT_METHOD_MAP = {
    CASH: order_entity_1.PaymentMethod.CASH,
    POS_TERMINAL: order_entity_1.PaymentMethod.POS_TERMINAL,
    BANK_TRANSFER: order_entity_1.PaymentMethod.BANK_TRANSFER,
};
let PosSyncService = PosSyncService_1 = class PosSyncService {
    constructor(inventoryService, dataSource, orderRepo, variantRepo, productRepo, syncJobRepo, paymentsService, couponsService) {
        this.inventoryService = inventoryService;
        this.dataSource = dataSource;
        this.orderRepo = orderRepo;
        this.variantRepo = variantRepo;
        this.productRepo = productRepo;
        this.syncJobRepo = syncJobRepo;
        this.paymentsService = paymentsService;
        this.couponsService = couponsService;
        this.logger = new common_1.Logger(PosSyncService_1.name);
    }
    async processBatch(batch) {
        const result = {
            terminalId: batch.terminalId,
            processedAt: new Date().toISOString(),
            successful: [],
            failed: [],
            skipped: [],
            summary: { total: batch.transactions.length, successCount: 0, failedCount: 0, skippedCount: 0 },
        };
        for (const tx of batch.transactions) {
            try {
                const txResult = await this.processTransaction(tx);
                if (txResult.status === 'SKIPPED') {
                    result.skipped.push({ transactionId: tx.transactionId, reason: txResult.reason });
                    result.summary.skippedCount++;
                }
                else if (txResult.status === 'SUCCESS') {
                    result.successful.push({
                        transactionId: tx.transactionId,
                        orderId: txResult.orderId,
                        orderNumber: txResult.orderNumber,
                    });
                    result.summary.successCount++;
                }
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : 'Unknown error';
                this.logger.warn(`POS sync failed for tx=${tx.transactionId}: ${reason}`);
                result.failed.push({ transactionId: tx.transactionId, reason });
                result.summary.failedCount++;
                await this.persistFailedJob(tx, batch.terminalId, reason);
            }
        }
        return result;
    }
    async processTransaction(tx) {
        const existingOrder = await this.orderRepo.findOne({
            where: { idempotencyKey: `pos-${tx.transactionId}` },
        });
        if (existingOrder) {
            return {
                status: 'SKIPPED',
                orderId: existingOrder.id,
                orderNumber: existingOrder.orderNumber,
                reason: 'Transaction already processed',
            };
        }
        const orderItems = [];
        let subtotal = 0;
        const currency = tx.currency ?? 'NGN';
        for (const item of tx.items) {
            const variant = await this.variantRepo.findOne({
                where: { id: item.variantId, isActive: true },
            });
            if (!variant) {
                throw new Error(`Variant ${item.variantId} not found or inactive`);
            }
            const product = await this.productRepo.findOne({
                where: { id: variant.productId },
            });
            if (!product || !product.isActive) {
                throw new Error(`Product for variant ${item.variantId} is unavailable`);
            }
            if (variant.trackInventory) {
                await this.inventoryService.recordMovement({
                    variantId: variant.id,
                    kind: inventory_entity_1.MovementKind.SALE,
                    quantity: item.quantity,
                    referenceId: tx.transactionId,
                    referenceType: 'POS_SALE',
                    reason: `POS sale from terminal ${tx.terminalId}`,
                    createdBy: tx.staffId,
                });
            }
            const useRetail = item.priceMode === 'RETAIL';
            const unitPrice = currency === 'USD'
                ? Number(useRetail ? variant.retailPriceUsd : variant.wholesalePriceUsd)
                : Number(useRetail ? variant.retailPriceNgn : variant.wholesalePriceNgn);
            const lineTotal = unitPrice * item.quantity;
            subtotal += lineTotal;
            orderItems.push({
                variantId: variant.id,
                productName: product.name,
                variantName: variant.name,
                sku: variant.sku,
                quantity: item.quantity,
                unitPrice,
                lineTotal,
                options: variant.options,
            });
        }
        let autoDiscountTotal = 0;
        let autoCouponCode;
        if (!tx.discountAmount && !tx.couponCode) {
            try {
                const resolved = await this.couponsService.resolveAutoApplyForLines(orderItems.map((i) => ({
                    variantId: i.variantId,
                    lineSubtotal: i.lineTotal,
                })), currency, coupon_entity_1.CouponChannel.POS);
                if (resolved && resolved.totalDiscount > 0) {
                    for (const item of orderItems) {
                        const d = resolved.perLine.get(item.variantId) ?? 0;
                        if (d > 0) {
                            item.discountAmount = d;
                            item.lineTotal = (item.lineTotal ?? 0) - d;
                        }
                    }
                    autoDiscountTotal = resolved.totalDiscount;
                    autoCouponCode = resolved.coupon.code;
                }
            }
            catch (err) {
                this.logger.warn(`Auto-apply lookup failed at POS sync: ${err.message}`);
            }
        }
        const discountTotal = (tx.discountAmount ?? 0) + autoDiscountTotal;
        const grandTotal = Math.max(0, subtotal - discountTotal);
        const primaryPayment = tx.payments.reduce((max, p) => (p.amount > max.amount ? p : max), tx.payments[0]);
        const paymentMethod = PAYMENT_METHOD_MAP[primaryPayment.method] ?? order_entity_1.PaymentMethod.CASH;
        const paymentDetails = tx.payments
            .map((p) => `${p.method}: ${currency} ${p.amount.toLocaleString()}`)
            .join(' + ');
        const hasCardLeg = tx.payments.some((p) => p.method === 'POS_TERMINAL');
        const initialStatus = hasCardLeg
            ? order_entity_1.OrderStatus.PENDING_PAYMENT
            : order_entity_1.OrderStatus.PAID;
        const saved = await this.dataSource.transaction(async (manager) => {
            return (0, order_number_util_1.withUniqueOrderNumber)(manager, 'POS', (orderNumber) => {
                const order = manager.create(order_entity_1.Order, {
                    orderNumber,
                    status: initialStatus,
                    channel: order_entity_1.OrderChannel.POS,
                    currency,
                    subtotal,
                    discountTotal,
                    shippingTotal: 0,
                    taxTotal: 0,
                    grandTotal,
                    paymentMethod,
                    paidAt: hasCardLeg ? undefined : new Date(tx.timestamp),
                    idempotencyKey: `pos-${tx.transactionId}`,
                    couponCode: tx.couponCode ?? autoCouponCode,
                    discountType: autoCouponCode
                        ? coupon_entity_1.DiscountType.PERCENTAGE
                        : tx.discountType ||
                            (tx.couponCode ? 'COUPON' : tx.discountAmount ? 'MANUAL' : undefined),
                    discountAppliedBy: autoCouponCode
                        ? 'AUTO'
                        : (tx.discountAmount || tx.couponCode) ? tx.staffId : undefined,
                    discountAppliedByName: autoCouponCode
                        ? 'Auto-applied promotion'
                        : (tx.discountAmount || tx.couponCode) ? tx.staffName : undefined,
                    discountAppliedAt: autoCouponCode || tx.discountAmount || tx.couponCode
                        ? tx.discountAppliedAt
                            ? new Date(tx.discountAppliedAt)
                            : new Date(tx.timestamp)
                        : undefined,
                    agentCode: tx.agentCode?.trim().toUpperCase() || null,
                    staffNote: `POS terminal: ${tx.terminalId} | Payment: ${paymentDetails}`,
                    customerNote: tx.customerName
                        ? `Customer: ${tx.customerName}${tx.customerPhone ? ` (${tx.customerPhone})` : ''}`
                        : undefined,
                    items: orderItems.map((item) => manager.create(order_entity_1.OrderItem, item)),
                    statusHistory: [
                        manager.create(order_entity_1.OrderStatusHistory, {
                            fromStatus: order_entity_1.OrderStatus.DRAFT,
                            toStatus: initialStatus,
                            changedBy: tx.staffId,
                            reason: hasCardLeg
                                ? 'POS sale — awaiting card payment on terminal'
                                : 'POS sale — immediate payment',
                        }),
                    ],
                });
                return manager.save(order_entity_1.Order, order);
            });
        });
        for (const split of tx.payments) {
            if (split.method === 'POS_TERMINAL')
                continue;
            const mapping = SPLIT_TO_PAYMENT[split.method] ?? SPLIT_TO_PAYMENT['CASH'];
            try {
                await this.paymentsService.record({
                    orderId: saved.id,
                    orderNumber: saved.orderNumber,
                    provider: mapping.provider,
                    channel: payment_entity_1.PaymentChannel.POS,
                    method: mapping.method,
                    amount: Math.round(split.amount),
                    currency,
                    merchantReference: `POS-${tx.transactionId}-${split.method}`,
                    status: payment_entity_1.PaymentStatus.SUCCEEDED,
                    createdBy: tx.staffId,
                    paidAt: new Date(tx.timestamp),
                });
            }
            catch (err) {
                this.logger.error(`Failed to record ${split.method} payment for order ${saved.orderNumber}: ${err instanceof Error ? err.message : err}`);
            }
        }
        return {
            status: 'SUCCESS',
            orderId: saved.id,
            orderNumber: saved.orderNumber,
        };
    }
    async persistFailedJob(tx, terminalId, errorMessage) {
        try {
            const existing = await this.syncJobRepo.findOne({
                where: { transactionId: tx.transactionId },
            });
            if (existing) {
                existing.retryCount++;
                existing.errorMessage = errorMessage;
                existing.status = existing.retryCount >= 3 ? pos_sync_job_entity_1.SyncJobStatus.DEAD_LETTER : pos_sync_job_entity_1.SyncJobStatus.FAILED;
                await this.syncJobRepo.save(existing);
                return;
            }
            const job = this.syncJobRepo.create({
                transactionId: tx.transactionId,
                terminalId,
                transactionPayload: tx,
                status: pos_sync_job_entity_1.SyncJobStatus.FAILED,
                errorMessage,
            });
            await this.syncJobRepo.save(job);
        }
        catch (err) {
            this.logger.error(`Failed to persist sync job for tx=${tx.transactionId}: ${err}`);
        }
    }
    async getRetryableJobs(maxRetries = 3) {
        return this.syncJobRepo
            .createQueryBuilder('job')
            .where('job.status = :status', { status: pos_sync_job_entity_1.SyncJobStatus.FAILED })
            .andWhere('job.retryCount < :max', { max: maxRetries })
            .orderBy('job.createdAt', 'ASC')
            .take(20)
            .getMany();
    }
    async completeJob(jobId, orderId) {
        await this.syncJobRepo.update(jobId, {
            status: pos_sync_job_entity_1.SyncJobStatus.COMPLETED,
            orderId,
        });
    }
};
exports.PosSyncService = PosSyncService;
exports.PosSyncService = PosSyncService = PosSyncService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(3, (0, typeorm_1.InjectRepository)(product_entity_1.ProductVariant)),
    __param(4, (0, typeorm_1.InjectRepository)(product_entity_1.Product)),
    __param(5, (0, typeorm_1.InjectRepository)(pos_sync_job_entity_1.PosSyncJob)),
    __metadata("design:paramtypes", [inventory_service_1.InventoryService,
        typeorm_2.DataSource,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        payments_service_1.PaymentsService,
        coupons_service_1.CouponsService])
], PosSyncService);
//# sourceMappingURL=pos-sync.service.js.map