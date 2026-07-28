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
var PaymentsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsController = exports.PosTerminalPaymentDto = exports.PosCashPaymentDto = exports.InitiatePaymentDto = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const payments_service_1 = require("./payments.service");
const payment_provider_interface_1 = require("./interfaces/payment-provider.interface");
const payment_entity_1 = require("./entities/payment.entity");
const order_entity_1 = require("../orders/entities/order.entity");
const terminal_entity_1 = require("../branches/entities/terminal.entity");
const refunds_service_1 = require("../refunds/refunds.service");
const agents_service_1 = require("../agents/agents.service");
const moniepoint_provider_1 = require("./providers/moniepoint.provider");
const jwt_auth_guard_1 = require("../../shared/guards/jwt-auth.guard");
const public_decorator_1 = require("../../shared/decorators/public.decorator");
const require_permissions_decorator_1 = require("../../shared/decorators/require-permissions.decorator");
const role_entity_1 = require("../users/entities/role.entity");
const current_user_decorator_1 = require("../../shared/decorators/current-user.decorator");
const user_entity_1 = require("../users/entities/user.entity");
const class_validator_1 = require("class-validator");
const common_2 = require("@nestjs/common");
class InitiatePaymentDto {
}
exports.InitiatePaymentDto = InitiatePaymentDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], InitiatePaymentDto.prototype, "orderId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(payment_entity_1.PaymentChannel),
    __metadata("design:type", String)
], InitiatePaymentDto.prototype, "channel", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], InitiatePaymentDto.prototype, "customerEmail", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], InitiatePaymentDto.prototype, "customerName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], InitiatePaymentDto.prototype, "callbackUrl", void 0);
class PosCashPaymentDto {
}
exports.PosCashPaymentDto = PosCashPaymentDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PosCashPaymentDto.prototype, "orderId", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], PosCashPaymentDto.prototype, "amount", void 0);
class PosTerminalPaymentDto {
}
exports.PosTerminalPaymentDto = PosTerminalPaymentDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PosTerminalPaymentDto.prototype, "orderId", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], PosTerminalPaymentDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PosTerminalPaymentDto.prototype, "terminalCode", void 0);
let PaymentsController = PaymentsController_1 = class PaymentsController {
    constructor(paymentsService, orderRepo, terminalRepo, refundsService, agentsService, moniepoint) {
        this.paymentsService = paymentsService;
        this.orderRepo = orderRepo;
        this.terminalRepo = terminalRepo;
        this.refundsService = refundsService;
        this.agentsService = agentsService;
        this.moniepoint = moniepoint;
        this.logger = new common_1.Logger(PaymentsController_1.name);
    }
    async list(page, limit, status, channel, provider, search) {
        const result = await this.paymentsService.list({
            page: page ? parseInt(page, 10) || 1 : 1,
            limit: limit ? parseInt(limit, 10) || 20 : 20,
            status: status ? status : undefined,
            channel: channel ? channel : undefined,
            provider: provider ? provider : undefined,
            search: search || undefined,
        });
        return { data: result };
    }
    async byOrder(orderId) {
        const items = await this.paymentsService.findByOrder(orderId);
        return { data: items };
    }
    async findOne(id) {
        const payment = await this.paymentsService.findById(id);
        return { data: payment };
    }
    async initiatePayment(dto, user) {
        const order = await this.orderRepo.findOne({ where: { id: dto.orderId } });
        if (!order)
            throw new common_2.NotFoundException(`Order ${dto.orderId} not found`);
        const email = dto.customerEmail || user?.email || order.guestEmail || '';
        const name = dto.customerName ||
            user?.fullName ||
            (order.shippingAddress
                ? `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`
                : '');
        const callbackUrl = dto.callbackUrl ??
            `${process.env['FRONTEND_URL'] ?? 'http://localhost:3002'}/order-confirmation?order=${order.orderNumber}`;
        const payment = await this.paymentsService.initiatePaystackPayment({
            order,
            channel: dto.channel,
            customerEmail: email,
            customerName: name,
            callbackUrl,
        });
        return {
            data: {
                paymentId: payment.id,
                merchantReference: payment.merchantReference,
                checkoutUrl: payment.checkoutUrl,
                status: payment.status,
                amount: Number(payment.amount),
                currency: payment.currency,
            },
        };
    }
    async reconcile(merchantReference) {
        const payment = await this.paymentsService.verifyAndReconcile(merchantReference);
        return {
            data: {
                paymentId: payment.id,
                merchantReference: payment.merchantReference,
                status: payment.status,
                amount: Number(payment.amount),
                currency: payment.currency,
                failureReason: payment.failureReason,
            },
        };
    }
    async posCash(dto, user) {
        const order = await this.orderRepo.findOne({ where: { id: dto.orderId } });
        if (!order)
            throw new common_2.NotFoundException(`Order ${dto.orderId} not found`);
        const payment = await this.paymentsService.recordCashPayment({
            order,
            amount: dto.amount,
            createdBy: user.id,
        });
        return {
            data: {
                paymentId: payment.id,
                merchantReference: payment.merchantReference,
                status: payment.status,
                amount: Number(payment.amount),
            },
        };
    }
    async posTerminal(dto, user) {
        const order = await this.orderRepo.findOne({ where: { id: dto.orderId } });
        if (!order)
            throw new common_2.NotFoundException(`Order ${dto.orderId} not found`);
        const terminal = await this.terminalRepo.findOne({
            where: { code: dto.terminalCode },
        });
        if (!terminal) {
            throw new common_2.NotFoundException(`Terminal ${dto.terminalCode} not found`);
        }
        if (!terminal.moniepointTerminalSerial) {
            throw new common_2.BadRequestException(`Terminal ${dto.terminalCode} has no Moniepoint card device configured.`);
        }
        const payment = await this.paymentsService.pushTerminalPayment({
            order,
            amount: dto.amount,
            terminalSerial: terminal.moniepointTerminalSerial,
            createdBy: user.id,
        });
        return {
            data: {
                paymentId: payment.id,
                merchantReference: payment.merchantReference,
                status: payment.status,
                amount: Number(payment.amount),
            },
        };
    }
    async paystackWebhook(req, signature) {
        const rawBody = req.rawBody;
        if (!rawBody)
            return { received: true };
        const valid = this.paymentsService
            .resolveProvider('NGN', payment_provider_interface_1.PaymentProviderName.PAYSTACK)
            .verifyWebhookSignature({
            provider: payment_provider_interface_1.PaymentProviderName.PAYSTACK,
            rawBody,
            signature: signature || '',
            headers: req.headers,
        });
        if (!valid) {
            this.logger.warn('Invalid Paystack webhook signature — rejected');
            return { received: false };
        }
        try {
            const event = JSON.parse(rawBody.toString());
            const eventName = event.event ?? '';
            const data = event.data ?? {};
            if (eventName.startsWith('refund.')) {
                const refundId = data['id']?.toString() ?? null;
                if (refundId && this.refundsService) {
                    const outcome = eventName === 'refund.processed' ? 'SUCCEEDED' : 'FAILED';
                    await this.refundsService.settleByProviderReference(refundId, outcome, event, data['message'] ?? undefined);
                }
                return { received: true };
            }
            if (eventName.startsWith('transfer.')) {
                const transferCode = data['transfer_code'];
                const ref = data['reference'];
                const identifier = transferCode ?? ref ?? null;
                const outcome = eventName === 'transfer.success' ? 'SUCCEEDED' : 'FAILED';
                const raw = event;
                const failureReason = data['message'] ?? undefined;
                if (identifier) {
                    let settled = null;
                    if (this.refundsService) {
                        settled = await this.refundsService.settleByProviderReference(identifier, outcome, raw, failureReason);
                    }
                    if (!settled && this.agentsService) {
                        await this.agentsService.settlePayout(identifier, outcome, raw, failureReason);
                    }
                }
                return { received: true };
            }
            const reference = data['reference'];
            if (reference) {
                const payment = await this.paymentsService.findByMerchantReference(reference);
                if (payment) {
                    await this.paymentsService.attachWebhook(payment.id, event);
                    await this.paymentsService.verifyAndReconcile(reference);
                }
                else {
                    this.logger.warn(`Paystack webhook for unknown reference ${reference}`);
                }
            }
        }
        catch (err) {
            this.logger.error(`Paystack webhook reconciliation error: ${err.message}`);
        }
        return { received: true };
    }
    async moniepointWebhook(req) {
        const rawBody = req.rawBody;
        if (!rawBody)
            return { received: true };
        try {
            const body = JSON.parse(rawBody.toString());
            const data = (body['data'] ?? body);
            const reference = data['merchantReference'] ??
                body['merchantReference'] ??
                data['merchant_reference'] ??
                null;
            if (reference) {
                const payment = await this.paymentsService.findByMerchantReference(reference);
                if (payment) {
                    await this.paymentsService.attachWebhook(payment.id, body);
                    await this.paymentsService.verifyAndReconcile(reference);
                }
                else {
                    this.logger.warn(`Moniepoint webhook for unknown reference ${reference}`);
                }
            }
            else {
                this.logger.warn('Moniepoint webhook had no recognisable merchant reference');
            }
        }
        catch (err) {
            this.logger.error(`Moniepoint webhook reconciliation error: ${err.message}`);
        }
        return { received: true };
    }
    async stripeWebhook(req, signature) {
        const rawBody = req.rawBody;
        if (!rawBody)
            return { received: true };
        const valid = this.paymentsService
            .resolveProvider('USD', payment_provider_interface_1.PaymentProviderName.STRIPE)
            .verifyWebhookSignature({
            provider: payment_provider_interface_1.PaymentProviderName.STRIPE,
            rawBody,
            signature: signature || '',
            headers: req.headers,
        });
        if (!valid) {
            this.logger.warn('Invalid Stripe webhook signature');
            return { received: false };
        }
        return { received: true };
    }
    async moniepointIntrospect() {
        if (!this.moniepoint) {
            return { data: { ok: false, error: 'MoniepointProvider not wired.' } };
        }
        const res = await this.moniepoint.introspect();
        return { data: res };
    }
};
exports.PaymentsController = PaymentsController;
__decorate([
    (0, common_1.Get)(),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.PAYMENTS_READ),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('channel')),
    __param(4, (0, common_1.Query)('provider')),
    __param(5, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('order/:orderId'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.PAYMENTS_READ),
    __param(0, (0, common_1.Param)('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "byOrder", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.PAYMENTS_READ),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)('initiate'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [InitiatePaymentDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "initiatePayment", null);
__decorate([
    (0, common_1.Post)('reconcile/:merchantReference'),
    __param(0, (0, common_1.Param)('merchantReference')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "reconcile", null);
__decorate([
    (0, common_1.Post)('pos/cash'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.POS_SELL),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [PosCashPaymentDto, user_entity_1.User]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "posCash", null);
__decorate([
    (0, common_1.Post)('pos/terminal'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.POS_SELL),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [PosTerminalPaymentDto,
        user_entity_1.User]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "posTerminal", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('webhooks/paystack'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Headers)('x-paystack-signature')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "paystackWebhook", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('webhooks/moniepoint'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "moniepointWebhook", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('webhooks/stripe'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Headers)('stripe-signature')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "stripeWebhook", null);
__decorate([
    (0, common_1.Post)('admin/moniepoint/introspect'),
    (0, require_permissions_decorator_1.RequirePermissions)(role_entity_1.Permission.PAYMENTS_READ),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "moniepointIntrospect", null);
exports.PaymentsController = PaymentsController = PaymentsController_1 = __decorate([
    (0, common_1.Controller)({ path: 'payments', version: '1' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(1, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(2, (0, typeorm_1.InjectRepository)(terminal_entity_1.Terminal)),
    __param(3, (0, common_1.Optional)()),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => refunds_service_1.RefundsService))),
    __param(4, (0, common_1.Optional)()),
    __param(4, (0, common_1.Inject)((0, common_1.forwardRef)(() => agents_service_1.AgentsService))),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService,
        typeorm_2.Repository,
        typeorm_2.Repository,
        refunds_service_1.RefundsService,
        agents_service_1.AgentsService,
        moniepoint_provider_1.MoniepointProvider])
], PaymentsController);
//# sourceMappingURL=payments.controller.js.map