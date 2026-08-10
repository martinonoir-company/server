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
var PosSessionsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PosSessionsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const pos_session_entity_1 = require("./entities/pos-session.entity");
const branch_entity_1 = require("../branches/entities/branch.entity");
const terminal_entity_1 = require("../branches/entities/terminal.entity");
const user_branch_entity_1 = require("../branches/entities/user-branch.entity");
const product_entity_1 = require("../products/entities/product.entity");
const inventory_entity_1 = require("../inventory/entities/inventory.entity");
const user_entity_1 = require("../users/entities/user.entity");
const pos_sync_service_1 = require("../pos/pos-sync.service");
const pos_gateway_1 = require("../realtime/pos.gateway");
let PosSessionsService = PosSessionsService_1 = class PosSessionsService {
    constructor(sessionRepo, terminalRepo, branchRepo, userBranchRepo, variantRepo, productRepo, mediaRepo, levelRepo, posSyncService, gateway, dataSource) {
        this.sessionRepo = sessionRepo;
        this.terminalRepo = terminalRepo;
        this.branchRepo = branchRepo;
        this.userBranchRepo = userBranchRepo;
        this.variantRepo = variantRepo;
        this.productRepo = productRepo;
        this.mediaRepo = mediaRepo;
        this.levelRepo = levelRepo;
        this.posSyncService = posSyncService;
        this.gateway = gateway;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(PosSessionsService_1.name);
    }
    async open(terminalCode, actor, currency = 'NGN') {
        const { terminal, branch } = await this.resolveTerminalAndBranch(terminalCode);
        await this.assertActorAssignedToBranch(actor, branch.id);
        const existing = await this.sessionRepo.findOne({
            where: {
                terminalId: terminal.id,
                status: pos_session_entity_1.PosSessionStatus.ACTIVE,
                deletedAt: (0, typeorm_2.IsNull)(),
            },
        });
        if (existing)
            return existing;
        const awaiting = await this.sessionRepo.findOne({
            where: {
                terminalId: terminal.id,
                status: pos_session_entity_1.PosSessionStatus.AWAITING_PAYMENT,
                deletedAt: (0, typeorm_2.IsNull)(),
            },
        });
        if (awaiting)
            return awaiting;
        const cart = {
            items: [],
            currency,
            totals: { subtotal: 0, discountTotal: 0, grandTotal: 0 },
            couponCode: null,
            discountAmount: 0,
            discountType: null,
        };
        const session = this.sessionRepo.create({
            terminalId: terminal.id,
            branchId: branch.id,
            openedByStaffId: actor.staffId,
            status: pos_session_entity_1.PosSessionStatus.ACTIVE,
            cart,
            version: 0,
            openedAt: new Date(),
        });
        const saved = await this.sessionRepo.save(session);
        this.gateway.emitSessionOpened(terminal.code, {
            sessionId: saved.id,
            terminalCode: terminal.code,
            branchCode: branch.code,
            version: saved.version,
            cart: saved.cart,
            openedByStaffId: saved.openedByStaffId,
        });
        return saved;
    }
    async getCurrent(terminalCode, actor) {
        const { terminal, branch } = await this.resolveTerminalAndBranch(terminalCode);
        await this.assertActorAssignedToBranch(actor, branch.id);
        const session = await this.sessionRepo.findOne({
            where: [
                {
                    terminalId: terminal.id,
                    status: pos_session_entity_1.PosSessionStatus.ACTIVE,
                    deletedAt: (0, typeorm_2.IsNull)(),
                },
                {
                    terminalId: terminal.id,
                    status: pos_session_entity_1.PosSessionStatus.AWAITING_PAYMENT,
                    deletedAt: (0, typeorm_2.IsNull)(),
                },
            ],
            order: { createdAt: 'DESC' },
        });
        if (!session) {
            throw new common_1.NotFoundException('No open session on this terminal');
        }
        return session;
    }
    async addItem(terminalCode, actor, dto) {
        return this.mutateActive(terminalCode, actor, dto.version, async (s) => {
            const dup = s.cart.items.find((l) => l.clientLineId === dto.clientLineId);
            if (dup) {
                return { changed: false, kind: 'item-added' };
            }
            const variant = await this.variantRepo.findOne({
                where: { id: dto.variantId, isActive: true },
            });
            if (!variant) {
                throw new common_1.NotFoundException('Variant not found or inactive');
            }
            const product = await this.productRepo.findOne({
                where: { id: variant.productId, isActive: true },
            });
            if (!product) {
                throw new common_1.NotFoundException('Product not found or inactive');
            }
            const media = (await this.mediaRepo.findOne({
                where: { variantId: variant.id, deletedAt: (0, typeorm_2.IsNull)() },
                order: { sortOrder: 'ASC', createdAt: 'ASC' },
            })) ??
                (await this.mediaRepo.findOne({
                    where: {
                        productId: product.id,
                        variantId: (0, typeorm_2.IsNull)(),
                        deletedAt: (0, typeorm_2.IsNull)(),
                    },
                    order: { sortOrder: 'ASC', createdAt: 'ASC' },
                }));
            const branch = await this.branchRepo.findOneOrFail({
                where: { id: s.branchId },
            });
            const level = await this.levelRepo.findOne({
                where: { variantId: variant.id, warehouseCode: branch.warehouseCode },
            });
            const available = level ? level.onHand - level.reserved : 0;
            const isUsd = s.cart.currency === 'USD';
            const retailPrice = Number(isUsd ? variant.retailPriceUsd : variant.retailPriceNgn);
            const wholesalePrice = Number(isUsd ? variant.wholesalePriceUsd : variant.wholesalePriceNgn);
            const unitPrice = retailPrice;
            const sameVariant = s.cart.items.find((l) => l.variantId === variant.id);
            if (sameVariant) {
                sameVariant.quantity += dto.quantity;
                return { changed: true, kind: 'item-added' };
            }
            const line = {
                clientLineId: dto.clientLineId,
                variantId: variant.id,
                productId: product.id,
                productName: product.name,
                variantName: variant.name ?? null,
                sku: variant.sku,
                barcode: variant.barcode ?? null,
                unitPrice,
                retailPrice,
                wholesalePrice,
                priceMode: 'RETAIL',
                quantity: dto.quantity,
                imageUrl: media?.url ?? null,
                options: variant.options ?? null,
                maxStock: available,
                scannedByStaffId: actor.staffId,
                scannedAt: new Date().toISOString(),
            };
            s.cart.items.push(line);
            return { changed: true, kind: 'item-added' };
        });
    }
    async updateItem(terminalCode, actor, lineId, dto) {
        return this.mutateActive(terminalCode, actor, dto.version, async (s) => {
            const idx = s.cart.items.findIndex((l) => l.clientLineId === lineId);
            if (idx === -1) {
                throw new common_1.NotFoundException('Line not found in this session');
            }
            const line = s.cart.items[idx];
            if (dto.quantity !== undefined) {
                if (dto.quantity <= 0) {
                    s.cart.items.splice(idx, 1);
                    return { changed: true, kind: 'item-removed' };
                }
                line.quantity = dto.quantity;
            }
            if (dto.priceMode !== undefined) {
                const target = dto.priceMode === 'WHOLESALE'
                    ? line.wholesalePrice
                    : line.retailPrice;
                if (typeof target === 'number' && target > 0) {
                    line.priceMode = dto.priceMode;
                    line.unitPrice = target;
                }
            }
            return { changed: true, kind: 'item-updated' };
        });
    }
    async paymentIntent(terminalCode, actor, dto) {
        const { terminal } = await this.resolveTerminalAndBranch(terminalCode);
        const session = await this.lockOpenSession(terminal.id, dto.version);
        await this.assertActorAssignedToBranch(actor, session.branchId);
        if (session.cart.items.length === 0) {
            throw new common_1.BadRequestException('Cannot proceed to payment: cart is empty');
        }
        session.cart.couponCode = dto.couponCode ?? null;
        session.cart.discountAmount = dto.discountAmount ?? 0;
        session.cart.discountType = dto.discountType ?? null;
        this.recomputeTotals(session.cart);
        session.status = pos_session_entity_1.PosSessionStatus.AWAITING_PAYMENT;
        session.version += 1;
        const saved = await this.sessionRepo.save(session);
        this.gateway.emitPaymentIntent(terminal.code, {
            sessionId: saved.id,
            terminalCode: terminal.code,
            version: saved.version,
            cart: saved.cart,
        });
        return saved;
    }
    async confirm(terminalCode, actor, dto) {
        const { terminal, branch } = await this.resolveTerminalAndBranch(terminalCode);
        const session = await this.lockOpenSession(terminal.id, dto.version);
        await this.assertActorAssignedToBranch(actor, session.branchId);
        if (session.status !== pos_session_entity_1.PosSessionStatus.AWAITING_PAYMENT) {
            throw new common_1.ConflictException('Session is not awaiting payment. Call payment-intent first.');
        }
        if (session.cart.items.length === 0) {
            throw new common_1.BadRequestException('Cannot confirm: cart is empty');
        }
        if (!dto.payments || dto.payments.length === 0) {
            throw new common_1.BadRequestException('At least one payment is required');
        }
        const tx = {
            transactionId: session.id,
            terminalId: terminal.code,
            staffId: actor.staffId,
            items: session.cart.items.map((l) => ({
                variantId: l.variantId,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                priceMode: l.priceMode,
            })),
            payments: dto.payments.map((p) => ({
                method: p.method,
                amount: p.amount,
            })),
            currency: session.cart.currency,
            timestamp: new Date().toISOString(),
            couponCode: session.cart.couponCode ?? undefined,
            discountAmount: session.cart.discountAmount || undefined,
            discountType: session.cart.discountType ?? undefined,
            customerName: dto.customerName,
            customerPhone: dto.customerPhone,
            agentCode: dto.agentCode,
        };
        const result = await this.posSyncService.processTransaction(tx);
        if (result.status !== 'SUCCESS' && result.status !== 'SKIPPED') {
            throw new common_1.ConflictException(result.reason ?? 'Sale could not be completed');
        }
        session.status = pos_session_entity_1.PosSessionStatus.COMPLETED;
        session.closedAt = new Date();
        session.resultOrderId = result.orderId ?? null;
        session.resultOrderNumber = result.orderNumber ?? null;
        session.version += 1;
        const saved = await this.sessionRepo.save(session);
        if (result.orderId) {
            await this.dataSource
                .query(`UPDATE "orders" SET "branchId" = $1 WHERE "id" = $2`, [
                branch.id,
                result.orderId,
            ])
                .catch((err) => this.logger.error(`Failed to stamp branchId on order ${result.orderId}: ${err instanceof Error ? err.message : err}`));
        }
        this.gateway.emitConfirmed(terminal.code, {
            sessionId: saved.id,
            terminalCode: terminal.code,
            version: saved.version,
            orderId: result.orderId ?? '',
            orderNumber: result.orderNumber ?? '',
        });
        return saved;
    }
    async void(terminalCode, actor, version, reason) {
        const { terminal } = await this.resolveTerminalAndBranch(terminalCode);
        const session = await this.lockOpenSession(terminal.id, version);
        await this.assertActorAssignedToBranch(actor, session.branchId);
        session.status = pos_session_entity_1.PosSessionStatus.VOIDED;
        session.closedAt = new Date();
        session.version += 1;
        const saved = await this.sessionRepo.save(session);
        this.gateway.emitVoided(terminal.code, {
            sessionId: saved.id,
            terminalCode: terminal.code,
            version: saved.version,
            reason,
        });
        return saved;
    }
    async mutateActive(terminalCode, actor, expectedVersion, mutate) {
        const { terminal } = await this.resolveTerminalAndBranch(terminalCode);
        const session = await this.lockOpenSession(terminal.id, expectedVersion);
        await this.assertActorAssignedToBranch(actor, session.branchId);
        if (session.status !== pos_session_entity_1.PosSessionStatus.ACTIVE) {
            throw new common_1.ConflictException('Session is no longer accepting item changes (already at payment or closed).');
        }
        const { changed, kind } = await mutate(session);
        if (!changed) {
            return session;
        }
        this.recomputeTotals(session.cart);
        session.version += 1;
        const saved = await this.sessionRepo.save(session);
        const payload = {
            sessionId: saved.id,
            terminalCode: terminal.code,
            version: saved.version,
            cart: saved.cart,
        };
        if (kind === 'item-added')
            this.gateway.emitItemAdded(terminal.code, payload);
        else if (kind === 'item-updated')
            this.gateway.emitItemUpdated(terminal.code, payload);
        else
            this.gateway.emitItemRemoved(terminal.code, payload);
        return saved;
    }
    async lockOpenSession(terminalId, expectedVersion) {
        const session = await this.sessionRepo.findOne({
            where: [
                {
                    terminalId,
                    status: pos_session_entity_1.PosSessionStatus.ACTIVE,
                    deletedAt: (0, typeorm_2.IsNull)(),
                },
                {
                    terminalId,
                    status: pos_session_entity_1.PosSessionStatus.AWAITING_PAYMENT,
                    deletedAt: (0, typeorm_2.IsNull)(),
                },
            ],
            order: { createdAt: 'DESC' },
        });
        if (!session) {
            throw new common_1.NotFoundException('No open session on this terminal');
        }
        if (session.version !== expectedVersion) {
            throw new common_1.ConflictException({
                error: 'SESSION_VERSION_CONFLICT',
                message: 'The session changed since you last read it. Refetch and retry.',
                currentVersion: session.version,
            });
        }
        return session;
    }
    async resolveTerminalAndBranch(terminalCode) {
        const code = terminalCode.trim().toUpperCase();
        const terminal = await this.terminalRepo.findOne({
            where: { code, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (!terminal)
            throw new common_1.NotFoundException('Terminal not found');
        if (!terminal.isActive) {
            throw new common_1.ConflictException('Terminal is inactive');
        }
        const branch = await this.branchRepo.findOne({
            where: { id: terminal.branchId, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (!branch)
            throw new common_1.NotFoundException('Branch not found');
        if (!branch.isActive) {
            throw new common_1.ConflictException('Branch is inactive');
        }
        return { terminal, branch };
    }
    async assertActorAssignedToBranch(actor, branchId) {
        if (actor.role === user_entity_1.UserRole.SUPER_ADMIN ||
            actor.role === user_entity_1.UserRole.COMPANY_SUPER_ADMIN) {
            return;
        }
        const assignment = await this.userBranchRepo.findOne({
            where: { userId: actor.staffId, branchId, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (!assignment) {
            throw new common_1.ForbiddenException('You are not assigned to this branch.');
        }
    }
    recomputeTotals(cart) {
        const subtotal = cart.items.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
        const discountTotal = Math.min(Math.round(cart.discountAmount ?? 0), subtotal);
        cart.totals = {
            subtotal,
            discountTotal,
            grandTotal: Math.max(0, subtotal - discountTotal),
        };
    }
};
exports.PosSessionsService = PosSessionsService;
exports.PosSessionsService = PosSessionsService = PosSessionsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(pos_session_entity_1.PosSession)),
    __param(1, (0, typeorm_1.InjectRepository)(terminal_entity_1.Terminal)),
    __param(2, (0, typeorm_1.InjectRepository)(branch_entity_1.Branch)),
    __param(3, (0, typeorm_1.InjectRepository)(user_branch_entity_1.UserBranch)),
    __param(4, (0, typeorm_1.InjectRepository)(product_entity_1.ProductVariant)),
    __param(5, (0, typeorm_1.InjectRepository)(product_entity_1.Product)),
    __param(6, (0, typeorm_1.InjectRepository)(product_entity_1.ProductMedia)),
    __param(7, (0, typeorm_1.InjectRepository)(inventory_entity_1.StockLevel)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        pos_sync_service_1.PosSyncService,
        pos_gateway_1.PosGateway,
        typeorm_2.DataSource])
], PosSessionsService);
//# sourceMappingURL=pos-sessions.service.js.map