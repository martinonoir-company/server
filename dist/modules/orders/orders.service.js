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
var OrdersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const order_entity_1 = require("./entities/order.entity");
const product_entity_1 = require("../products/entities/product.entity");
const product_entity_2 = require("../products/entities/product.entity");
const inventory_service_1 = require("../inventory/inventory.service");
const inventory_entity_1 = require("../inventory/entities/inventory.entity");
const cart_service_1 = require("../cart/cart.service");
const shipping_service_1 = require("../shipping/shipping.service");
const coupons_service_1 = require("../coupons/coupons.service");
const coupon_entity_1 = require("../coupons/entities/coupon.entity");
const email_service_1 = require("../notifications/email.service");
const push_service_1 = require("../notifications/push.service");
const user_entity_1 = require("../users/entities/user.entity");
const order_number_util_1 = require("./order-number.util");
const settings_service_1 = require("../settings/settings.service");
let OrdersService = OrdersService_1 = class OrdersService {
    constructor(orderRepo, itemRepo, historyRepo, variantRepo, productRepo, userRepo, inventoryService, cartService, shippingService, couponsService, emailService, pushService, settingsService, dataSource) {
        this.orderRepo = orderRepo;
        this.itemRepo = itemRepo;
        this.historyRepo = historyRepo;
        this.variantRepo = variantRepo;
        this.productRepo = productRepo;
        this.userRepo = userRepo;
        this.inventoryService = inventoryService;
        this.cartService = cartService;
        this.shippingService = shippingService;
        this.couponsService = couponsService;
        this.emailService = emailService;
        this.pushService = pushService;
        this.settingsService = settingsService;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(OrdersService_1.name);
    }
    async checkout(dto, userId) {
        if (dto.idempotencyKey) {
            const existing = await this.orderRepo.findOne({
                where: { idempotencyKey: dto.idempotencyKey },
                relations: ['items'],
            });
            if (existing)
                return existing;
        }
        const currency = dto.currency ?? 'NGN';
        const channel = dto.channel ?? order_entity_1.OrderChannel.STOREFRONT;
        const minWholesaleQty = await this.settingsService.getWholesaleMinQty();
        const order = await this.dataSource.transaction(async (manager) => {
            let subtotal = 0;
            const orderItems = [];
            for (const cartItem of dto.items) {
                const variant = await manager.findOne(product_entity_1.ProductVariant, {
                    where: { id: cartItem.variantId, isActive: true },
                });
                if (!variant) {
                    throw new common_1.NotFoundException(`Variant ${cartItem.variantId} not found`);
                }
                const product = await manager.findOne(product_entity_2.Product, {
                    where: { id: variant.productId },
                });
                if (!product || !product.isActive) {
                    throw new common_1.BadRequestException(`Product for variant ${cartItem.variantId} is unavailable`);
                }
                if (variant.trackInventory) {
                    if (channel === order_entity_1.OrderChannel.POS) {
                        await this.inventoryService.recordMovement({
                            variantId: variant.id,
                            kind: inventory_entity_1.MovementKind.SALE,
                            quantity: cartItem.quantity,
                            referenceId: dto.idempotencyKey,
                            referenceType: 'POS_SALE',
                            reason: 'POS direct sale',
                        });
                    }
                    else {
                        await this.inventoryService.recordMovement({
                            variantId: variant.id,
                            kind: inventory_entity_1.MovementKind.RESERVATION,
                            quantity: cartItem.quantity,
                            referenceId: dto.idempotencyKey,
                            referenceType: 'ORDER',
                            reason: 'Checkout reservation',
                        });
                    }
                }
                const staffChannel = channel === order_entity_1.OrderChannel.POS || channel === order_entity_1.OrderChannel.ADMIN;
                const lineWholesale = staffChannel || cartItem.wholesale === true;
                if (lineWholesale &&
                    !staffChannel &&
                    cartItem.quantity < minWholesaleQty) {
                    throw new common_1.BadRequestException(`Wholesale orders require a minimum quantity of ${minWholesaleQty} per item. ` +
                        `"${product.name}${variant.name ? ` — ${variant.name}` : ''}" has only ${cartItem.quantity}.`);
                }
                let unitPrice;
                if (lineWholesale) {
                    unitPrice = currency === 'USD' ? Number(variant.wholesalePriceUsd) : Number(variant.wholesalePriceNgn);
                }
                else {
                    unitPrice = currency === 'USD' ? Number(variant.retailPriceUsd) : Number(variant.retailPriceNgn);
                }
                const lineTotal = unitPrice * cartItem.quantity;
                subtotal += lineTotal;
                orderItems.push({
                    variantId: variant.id,
                    productName: product.name,
                    variantName: variant.name,
                    sku: variant.sku,
                    quantity: cartItem.quantity,
                    unitPrice,
                    lineTotal,
                    options: variant.options,
                    isWholesale: lineWholesale,
                });
            }
            const orderIsWholesale = orderItems.some((i) => i.isWholesale);
            let autoDiscountTotal = 0;
            let autoCouponCode;
            try {
                if (orderItems.length > 0) {
                    const couponChannel = channel === order_entity_1.OrderChannel.STOREFRONT
                        ? coupon_entity_1.CouponChannel.STOREFRONT
                        : channel === order_entity_1.OrderChannel.POS
                            ? coupon_entity_1.CouponChannel.POS
                            : coupon_entity_1.CouponChannel.MOBILE;
                    const resolved = await this.couponsService.resolveAutoApplyForLines(orderItems.map((i) => ({
                        variantId: i.variantId,
                        lineSubtotal: i.lineTotal,
                    })), currency, couponChannel);
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
            }
            catch (err) {
                this.logger.warn(`Auto-apply lookup failed at checkout: ${err.message}`);
            }
            const finalSubtotal = subtotal;
            const finalDiscountTotal = autoDiscountTotal;
            const isPOSChannel = channel === order_entity_1.OrderChannel.POS;
            let shippingTotalKobo = 0;
            let shippingQuoteId = null;
            let shippingQuoteExpiresAt = null;
            const optOut = !!dto.shippingOptOut || isPOSChannel;
            if (!optOut) {
                try {
                    const cc = dto.shippingAddress.country.length === 2
                        ? dto.shippingAddress.country.toUpperCase()
                        : 'NG';
                    const recipientAddr = {
                        name: `${dto.shippingAddress.firstName} ${dto.shippingAddress.lastName}`.trim(),
                        phone: dto.shippingAddress.phone ?? '+2348000000000',
                        email: dto.guestEmail ?? 'noreply@martinonoir.com',
                        addressLine1: dto.shippingAddress.line1,
                        addressLine2: dto.shippingAddress.line2,
                        city: dto.shippingAddress.city,
                        state: dto.shippingAddress.state,
                        stateOrProvinceCode: dto.shippingStateCode,
                        country: cc === 'NG' ? 'Nigeria' : dto.shippingAddress.country,
                        countryCode: cc,
                        postalCode: dto.shippingAddress.postalCode ?? '100001',
                    };
                    const rates = await this.shippingService.calculateRates({
                        country: cc,
                        state: dto.shippingAddress.state,
                        weightKg: Math.max(0.5, orderItems.reduce((s, i) => s + (i.quantity ?? 0), 0) * 0.5),
                        currency,
                        subtotal: finalSubtotal,
                        recipient: recipientAddr,
                        itemsValueNgn: Math.round(finalSubtotal / 100),
                    });
                    if (rates.length > 0) {
                        const pick = rates[0];
                        shippingTotalKobo = pick.rate;
                        shippingQuoteId = pick.quoteId ?? null;
                        shippingQuoteExpiresAt = pick.expiresAt
                            ? new Date(pick.expiresAt)
                            : null;
                    }
                }
                catch (err) {
                    this.logger.warn(`AAJ quote failed at checkout: ${err.message} — order will be created with 0 shipping fee and retried post-payment.`);
                }
            }
            const finalShippingTotal = shippingTotalKobo;
            const finalGrandTotal = finalSubtotal - finalDiscountTotal + finalShippingTotal;
            const isPOS = channel === order_entity_1.OrderChannel.POS;
            const initialStatus = isPOS ? order_entity_1.OrderStatus.PAID : order_entity_1.OrderStatus.PENDING_PAYMENT;
            return (0, order_number_util_1.withUniqueOrderNumber)(manager, 'MN', (orderNumber) => {
                const order = manager.create(order_entity_1.Order, {
                    orderNumber,
                    userId,
                    guestEmail: dto.guestEmail,
                    status: initialStatus,
                    channel,
                    currency,
                    subtotal: finalSubtotal,
                    discountTotal: finalDiscountTotal,
                    shippingTotal: finalShippingTotal,
                    taxTotal: 0,
                    grandTotal: finalGrandTotal,
                    shippingOptOut: optOut,
                    isWholesale: orderIsWholesale,
                    dispatchStatus: !optOut && !isPOSChannel ? 'PENDING' : null,
                    shippingQuoteId: shippingQuoteId ?? undefined,
                    shippingQuoteExpiresAt: shippingQuoteExpiresAt ?? undefined,
                    paymentMethod: dto.paymentMethod,
                    paidAt: isPOS ? new Date() : undefined,
                    shippingAddress: dto.shippingAddress,
                    couponCode: dto.couponCode ?? autoCouponCode ?? undefined,
                    discountType: autoCouponCode
                        ? coupon_entity_1.DiscountType.PERCENTAGE
                        : undefined,
                    discountAppliedBy: autoCouponCode ? 'AUTO' : undefined,
                    discountAppliedByName: autoCouponCode
                        ? 'Auto-applied promotion'
                        : undefined,
                    discountAppliedAt: autoDiscountTotal > 0 ? new Date() : undefined,
                    customerNote: dto.customerNote,
                    idempotencyKey: dto.idempotencyKey,
                    agentCode: dto.agentCode?.trim().toUpperCase() || null,
                    items: orderItems.map((item) => manager.create(order_entity_1.OrderItem, item)),
                    statusHistory: [
                        manager.create(order_entity_1.OrderStatusHistory, {
                            fromStatus: order_entity_1.OrderStatus.DRAFT,
                            toStatus: initialStatus,
                            changedBy: userId,
                            reason: isPOS ? 'POS sale — immediate payment' : 'Checkout initiated',
                        }),
                    ],
                });
                return manager.save(order_entity_1.Order, order);
            });
        });
        if (userId) {
            try {
                await this.cartService.clearCart(userId);
            }
            catch {
            }
        }
        this.sendOrderEmail(order).catch((err) => this.logger.error(`Order confirmation email failed: ${err.message}`));
        return order;
    }
    async transitionStatus(orderId, dto, changedBy) {
        const order = await this.findOne(orderId);
        const allowedNext = order_entity_1.ORDER_TRANSITIONS[order.status];
        if (!allowedNext.includes(dto.status)) {
            throw new common_1.BadRequestException(`Cannot transition from ${order.status} to ${dto.status}. Allowed: ${allowedNext.join(', ') || 'none'}`);
        }
        return this.dataSource.transaction(async (manager) => {
            const history = manager.create(order_entity_1.OrderStatusHistory, {
                orderId: order.id,
                fromStatus: order.status,
                toStatus: dto.status,
                changedBy,
                reason: dto.reason,
            });
            await manager.save(order_entity_1.OrderStatusHistory, history);
            if (dto.status === order_entity_1.OrderStatus.PAID) {
                order.paidAt = new Date();
                for (const item of order.items) {
                    await this.inventoryService.recordMovement({
                        variantId: item.variantId,
                        kind: inventory_entity_1.MovementKind.RELEASE,
                        quantity: item.quantity,
                        referenceId: order.id,
                        referenceType: 'ORDER',
                        reason: 'Payment confirmed — releasing reservation',
                    });
                    await this.inventoryService.recordMovement({
                        variantId: item.variantId,
                        kind: inventory_entity_1.MovementKind.SALE,
                        quantity: item.quantity,
                        referenceId: order.id,
                        referenceType: 'ORDER',
                        reason: 'Order paid',
                    });
                }
            }
            if (dto.status === order_entity_1.OrderStatus.CANCELLED) {
                for (const item of order.items) {
                    await this.inventoryService.recordMovement({
                        variantId: item.variantId,
                        kind: inventory_entity_1.MovementKind.RELEASE,
                        quantity: item.quantity,
                        referenceId: order.id,
                        referenceType: 'ORDER',
                        reason: dto.reason ?? 'Order cancelled',
                    });
                }
            }
            if (dto.status === order_entity_1.OrderStatus.RETURNED) {
                for (const item of order.items) {
                    await this.inventoryService.recordMovement({
                        variantId: item.variantId,
                        kind: inventory_entity_1.MovementKind.RETURN,
                        quantity: item.quantity,
                        referenceId: order.id,
                        referenceType: 'ORDER',
                        reason: 'Order returned',
                    });
                }
            }
            await manager.update(order_entity_1.Order, order.id, { status: dto.status, paidAt: order.paidAt });
            const updated = await manager.findOneOrFail(order_entity_1.Order, {
                where: { id: order.id },
                relations: ['items', 'statusHistory', 'user'],
                order: { statusHistory: { createdAt: 'ASC' } },
            });
            if (dto.status === order_entity_1.OrderStatus.PAID) {
                this.sendOrderEmail(updated).catch((err) => this.logger.error(`Order confirmation email failed: ${err.message}`));
            }
            if (dto.status === order_entity_1.OrderStatus.SHIPPED) {
                this.sendShippingEmail(updated).catch((err) => this.logger.error(`Shipping notification email failed: ${err.message}`));
            }
            return updated;
        });
    }
    async dispatchOrder(orderId, dto, staffId) {
        const order = await this.findOne(orderId);
        if (order.status === order_entity_1.OrderStatus.SHIPPED &&
            order.trackingNumber === dto.trackingNumber &&
            order.carrier === dto.carrier) {
            this.logger.debug(`Idempotent dispatch: order ${order.orderNumber} already shipped with ${dto.trackingNumber}`);
            return order;
        }
        if (order.status !== order_entity_1.OrderStatus.PROCESSING) {
            throw new common_1.BadRequestException(`Cannot dispatch order in status ${order.status}. Order must be in PROCESSING.`);
        }
        const byItemId = new Map(order.items.map((i) => [i.id, i]));
        const mismatches = [];
        const seen = new Set();
        for (const line of dto.items) {
            if (seen.has(line.orderItemId)) {
                throw new common_1.BadRequestException(`Duplicate orderItemId in dispatch payload: ${line.orderItemId}`);
            }
            seen.add(line.orderItemId);
            const item = byItemId.get(line.orderItemId);
            if (!item) {
                throw new common_1.BadRequestException(`orderItemId ${line.orderItemId} does not belong to order ${order.orderNumber}`);
            }
            if (line.scannedQty !== item.quantity) {
                mismatches.push({
                    orderItemId: item.id,
                    sku: item.sku,
                    ordered: item.quantity,
                    scanned: line.scannedQty,
                });
            }
        }
        for (const item of order.items) {
            if (!seen.has(item.id)) {
                mismatches.push({
                    orderItemId: item.id,
                    sku: item.sku,
                    ordered: item.quantity,
                    scanned: 0,
                });
            }
        }
        if (mismatches.length > 0) {
            throw new common_1.ConflictException({
                error: 'DISPATCH_QUANTITY_MISMATCH',
                message: 'Every order item must be fully scanned before dispatch. Resolve the mismatched lines.',
                mismatches,
            });
        }
        return this.dataSource.transaction(async (manager) => {
            const shippedAt = new Date();
            await manager.update(order_entity_1.Order, order.id, {
                trackingNumber: dto.trackingNumber,
                carrier: dto.carrier,
                shippedAt,
                status: order_entity_1.OrderStatus.SHIPPED,
            });
            const history = manager.create(order_entity_1.OrderStatusHistory, {
                orderId: order.id,
                fromStatus: order_entity_1.OrderStatus.PROCESSING,
                toStatus: order_entity_1.OrderStatus.SHIPPED,
                changedBy: staffId,
                reason: dto.note
                    ? `Dispatched via ${dto.carrier} (${dto.trackingNumber}) — ${dto.note}`
                    : `Dispatched via ${dto.carrier} (${dto.trackingNumber})`,
            });
            await manager.save(order_entity_1.OrderStatusHistory, history);
            const updated = await manager.findOneOrFail(order_entity_1.Order, {
                where: { id: order.id },
                relations: ['items', 'statusHistory', 'user'],
                order: { statusHistory: { createdAt: 'ASC' } },
            });
            this.sendShippingEmailWithTracking(updated).catch((err) => this.logger.error(`Shipping notification email failed for ${updated.orderNumber}: ${err.message}`));
            this.pushService
                .sendToUser(updated.userId, {
                title: 'Your order is on its way',
                body: `Order ${updated.orderNumber} has shipped via ${updated.carrier ?? 'courier'}.`,
                data: {
                    type: 'ORDER_SHIPPED',
                    orderId: updated.id,
                    orderNumber: updated.orderNumber,
                    trackingNumber: updated.trackingNumber,
                    carrier: updated.carrier,
                },
            })
                .catch((err) => this.logger.error(`Shipped push failed for ${updated.orderNumber}: ${err instanceof Error ? err.message : err}`));
            return updated;
        });
    }
    async markDispatchedByScan(ref, staffId, note) {
        const key = ref.trim();
        const order = await this.orderRepo.findOne({
            where: [{ id: key }, { orderNumber: key }],
            relations: ['items'],
        });
        if (!order) {
            throw new common_1.NotFoundException(`Order "${ref}" not found`);
        }
        if (!order.dispatchStatus) {
            throw new common_1.BadRequestException(`Order ${order.orderNumber} does not require dispatch (no shipping or pickup opted out).`);
        }
        if (order.dispatchStatus === 'DISPATCHED') {
            return order;
        }
        order.dispatchStatus = 'DISPATCHED';
        order.dispatchedAt = new Date();
        order.dispatchedBy = staffId ?? null;
        if (note) {
            order.staffNote = order.staffNote
                ? `${order.staffNote}\n[Dispatch] ${note}`
                : `[Dispatch] ${note}`;
        }
        await this.orderRepo.save(order);
        this.logger.debug(`Order ${order.orderNumber} marked DISPATCHED by ${staffId ?? 'unknown'}`);
        return order;
    }
    async findDispatchQueue(query) {
        return this.findAll({ ...query, requiresDispatch: 'true' });
    }
    async markDelivered(orderId, dto, staffId) {
        const order = await this.findOne(orderId);
        if (order.status === order_entity_1.OrderStatus.DELIVERED) {
            this.logger.debug(`Idempotent delivered: order ${order.orderNumber} already delivered`);
            return order;
        }
        if (order.status !== order_entity_1.OrderStatus.SHIPPED) {
            throw new common_1.BadRequestException(`Cannot mark delivered: order ${order.orderNumber} is in status ${order.status}, expected SHIPPED.`);
        }
        return this.dataSource.transaction(async (manager) => {
            const deliveredAt = new Date();
            await manager.update(order_entity_1.Order, order.id, {
                deliveredAt,
                status: order_entity_1.OrderStatus.DELIVERED,
            });
            const history = manager.create(order_entity_1.OrderStatusHistory, {
                orderId: order.id,
                fromStatus: order_entity_1.OrderStatus.SHIPPED,
                toStatus: order_entity_1.OrderStatus.DELIVERED,
                changedBy: staffId,
                reason: dto.note ?? 'Delivered',
            });
            await manager.save(order_entity_1.OrderStatusHistory, history);
            const updated = await manager.findOneOrFail(order_entity_1.Order, {
                where: { id: order.id },
                relations: ['items', 'statusHistory', 'user'],
                order: { statusHistory: { createdAt: 'ASC' } },
            });
            this.sendDeliveredEmail(updated).catch((err) => this.logger.error(`Delivered email failed for ${updated.orderNumber}: ${err.message}`));
            this.pushService
                .sendToUser(updated.userId, {
                title: 'Your order has arrived',
                body: `Order ${updated.orderNumber} has been delivered. Enjoy!`,
                data: {
                    type: 'ORDER_DELIVERED',
                    orderId: updated.id,
                    orderNumber: updated.orderNumber,
                },
            })
                .catch((err) => this.logger.error(`Delivered push failed for ${updated.orderNumber}: ${err instanceof Error ? err.message : err}`));
            return updated;
        });
    }
    async sendShippingEmailWithTracking(order) {
        const email = await this.resolveOrderEmail(order);
        if (!email)
            return;
        await this.emailService.sendShippingNotification(email, order.orderNumber, order.trackingNumber, order.carrier);
    }
    async sendDeliveredEmail(order) {
        const email = await this.resolveOrderEmail(order);
        if (!email)
            return;
        await this.emailService.sendOrderDelivered(email, order.orderNumber);
    }
    async findAll(query) {
        const page = query.page ?? 1;
        const limit = Math.min(query.limit ?? 20, 100);
        const skip = (page - 1) * limit;
        const qb = this.orderRepo
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.items', 'item')
            .leftJoinAndSelect('order.user', 'user');
        if (query.status) {
            qb.andWhere('order.status = :status', { status: query.status });
        }
        if (query.userId) {
            qb.andWhere('order.userId = :userId', { userId: query.userId });
        }
        if (query.channel) {
            qb.andWhere('order.channel = :channel', { channel: query.channel });
        }
        if (query.startDate) {
            qb.andWhere('order.createdAt >= :startDate', { startDate: new Date(query.startDate) });
        }
        if (query.endDate) {
            const end = new Date(query.endDate);
            end.setHours(23, 59, 59, 999);
            qb.andWhere('order.createdAt <= :endDate', { endDate: end });
        }
        if (query.search?.trim()) {
            qb.andWhere('order.orderNumber ILIKE :search', { search: `%${query.search.trim()}%` });
        }
        if (query.wholesale === 'true') {
            qb.andWhere('order.isWholesale = true');
        }
        else if (query.wholesale === 'false') {
            qb.andWhere('order.isWholesale = false');
        }
        if (query.dispatchStatus) {
            qb.andWhere('order.dispatchStatus = :ds', { ds: query.dispatchStatus });
        }
        if (query.requiresDispatch === 'true') {
            qb.andWhere('order.dispatchStatus IS NOT NULL');
        }
        const sortBy = query.sortBy ?? 'createdAt';
        const sortOrder = query.sortOrder ?? 'DESC';
        qb.orderBy(`order.${sortBy}`, sortOrder);
        qb.skip(skip).take(limit);
        const [items, total] = await qb.getManyAndCount();
        return { items, total, page, limit, pages: Math.ceil(total / limit) };
    }
    async findOne(id) {
        const order = await this.orderRepo.findOne({
            where: { id },
            relations: ['items', 'statusHistory', 'user'],
            order: { statusHistory: { createdAt: 'ASC' } },
        });
        if (!order)
            throw new common_1.NotFoundException(`Order ${id} not found`);
        return order;
    }
    async findByOrderNumber(orderNumber) {
        const order = await this.orderRepo.findOne({
            where: { orderNumber },
            relations: ['items', 'statusHistory'],
        });
        if (!order)
            throw new common_1.NotFoundException(`Order #${orderNumber} not found`);
        return order;
    }
    async findByOrderNumberAndEmail(orderNumber, email) {
        const order = await this.orderRepo.findOne({
            where: { orderNumber },
            relations: ['items', 'statusHistory'],
        });
        if (!order)
            throw new common_1.NotFoundException('Order not found');
        const orderEmail = await this.resolveOrderEmail(order);
        if (!orderEmail ||
            orderEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
            throw new common_1.NotFoundException('Order not found');
        }
        return order;
    }
    async sendOrderEmail(order) {
        const email = await this.resolveOrderEmail(order);
        if (!email)
            return;
        const items = order.items?.map((i) => ({
            name: i.productName,
            variant: i.variantName ?? '',
            quantity: i.quantity,
            price: Number(i.lineTotal),
        }));
        await this.emailService.sendOrderConfirmation(email, order.orderNumber, Number(order.grandTotal), order.currency, items);
    }
    async sendShippingEmail(order) {
        const email = await this.resolveOrderEmail(order);
        if (!email)
            return;
        await this.emailService.sendShippingNotification(email, order.orderNumber);
    }
    async resolveOrderEmail(order) {
        if (order.guestEmail)
            return order.guestEmail;
        if (order.user?.email)
            return order.user.email;
        if (order.userId) {
            const user = await this.userRepo.findOne({ where: { id: order.userId } });
            return user?.email ?? null;
        }
        return null;
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = OrdersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(1, (0, typeorm_1.InjectRepository)(order_entity_1.OrderItem)),
    __param(2, (0, typeorm_1.InjectRepository)(order_entity_1.OrderStatusHistory)),
    __param(3, (0, typeorm_1.InjectRepository)(product_entity_1.ProductVariant)),
    __param(4, (0, typeorm_1.InjectRepository)(product_entity_2.Product)),
    __param(5, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        inventory_service_1.InventoryService,
        cart_service_1.CartService,
        shipping_service_1.ShippingService,
        coupons_service_1.CouponsService,
        email_service_1.EmailService,
        push_service_1.PushService,
        settings_service_1.SettingsService,
        typeorm_2.DataSource])
], OrdersService);
//# sourceMappingURL=orders.service.js.map