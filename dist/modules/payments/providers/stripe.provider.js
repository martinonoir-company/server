"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var StripeProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeProvider = void 0;
const common_1 = require("@nestjs/common");
const crypto = __importStar(require("crypto"));
const payment_provider_interface_1 = require("../interfaces/payment-provider.interface");
const base_entity_1 = require("../../../shared/entities/base.entity");
let StripeProvider = StripeProvider_1 = class StripeProvider {
    constructor() {
        this.name = payment_provider_interface_1.PaymentProviderName.STRIPE;
        this.logger = new common_1.Logger(StripeProvider_1.name);
        this.secretKey = process.env['STRIPE_SECRET_KEY'] ?? '';
        this.webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';
        this.isLive = !!this.secretKey;
        if (!this.isLive) {
            this.logger.warn('STRIPE_SECRET_KEY not set — running in stub mode');
        }
    }
    async createPayment(input) {
        this.logger.log(`Creating Stripe payment for order ${input.orderNumber}: ${input.amount} ${input.currency}`);
        if (!this.isLive) {
            const reference = `STRIPE-${(0, base_entity_1.generateUlid)()}`;
            return {
                providerReference: reference,
                amount: input.amount,
                currency: input.currency,
                provider: this.name,
                status: payment_provider_interface_1.PaymentIntentStatus.REQUIRES_ACTION,
                checkoutUrl: `https://checkout.stripe.com/stub/${reference}`,
                metadata: { orderId: input.orderId, orderNumber: input.orderNumber },
            };
        }
        const params = new URLSearchParams();
        params.set('mode', 'payment');
        params.set('success_url', input.callbackUrl);
        params.set('cancel_url', `${process.env['FRONTEND_URL'] ?? 'http://localhost:3002'}/cart`);
        params.set('customer_email', input.customerEmail);
        params.set('line_items[0][price_data][currency]', input.currency.toLowerCase());
        params.set('line_items[0][price_data][product_data][name]', `Order ${input.orderNumber}`);
        params.set('line_items[0][price_data][unit_amount]', String(input.amount));
        params.set('line_items[0][quantity]', '1');
        params.set('metadata[orderId]', input.orderId);
        params.set('metadata[orderNumber]', input.orderNumber);
        const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.secretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });
        const data = await res.json();
        if (data.error) {
            this.logger.error(`Stripe session create failed: ${data.error.message}`);
            return {
                providerReference: '',
                amount: input.amount,
                currency: input.currency,
                provider: this.name,
                status: payment_provider_interface_1.PaymentIntentStatus.FAILED,
                metadata: { error: data.error.message },
            };
        }
        return {
            providerReference: data.id,
            amount: input.amount,
            currency: input.currency,
            provider: this.name,
            status: payment_provider_interface_1.PaymentIntentStatus.REQUIRES_ACTION,
            checkoutUrl: data.url,
            metadata: { sessionId: data.id },
        };
    }
    async verifyPayment(input) {
        this.logger.log(`Verifying Stripe payment ${input.providerReference}`);
        if (!this.isLive) {
            return {
                providerReference: input.providerReference,
                amount: 0,
                currency: 'USD',
                provider: this.name,
                status: payment_provider_interface_1.PaymentIntentStatus.SUCCEEDED,
            };
        }
        const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${input.providerReference}`, {
            headers: { 'Authorization': `Bearer ${this.secretKey}` },
        });
        const data = await res.json();
        const statusMap = {
            complete: payment_provider_interface_1.PaymentIntentStatus.SUCCEEDED,
            expired: payment_provider_interface_1.PaymentIntentStatus.CANCELLED,
            open: payment_provider_interface_1.PaymentIntentStatus.PENDING,
        };
        return {
            providerReference: input.providerReference,
            amount: data.amount_total ?? 0,
            currency: (data.currency ?? 'usd').toUpperCase(),
            provider: this.name,
            status: statusMap[data.status] ?? payment_provider_interface_1.PaymentIntentStatus.PENDING,
            metadata: { paymentStatus: data.payment_status },
        };
    }
    async refund(input) {
        this.logger.log(`Processing Stripe refund for ${input.providerReference}: ${input.amount}`);
        if (!this.isLive) {
            return {
                providerReference: input.providerReference,
                refundReference: `STRIPE-REF-${(0, base_entity_1.generateUlid)()}`,
                amount: input.amount,
                status: 'PENDING',
            };
        }
        const params = new URLSearchParams();
        params.set('payment_intent', input.providerReference);
        params.set('amount', String(input.amount));
        if (input.reason)
            params.set('reason', 'requested_by_customer');
        const res = await fetch('https://api.stripe.com/v1/refunds', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.secretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });
        const data = await res.json();
        return {
            providerReference: input.providerReference,
            refundReference: data.id ?? `STRIPE-REF-${(0, base_entity_1.generateUlid)()}`,
            amount: input.amount,
            status: data.status === 'succeeded' ? 'SUCCEEDED' : 'PENDING',
        };
    }
    verifyWebhookSignature(payload) {
        if (!this.isLive || !this.webhookSecret) {
            this.logger.log('[STUB] Stripe webhook signature verification bypassed');
            return true;
        }
        const sigHeader = payload.signature;
        const parts = sigHeader.split(',');
        const timestampPart = parts.find(p => p.startsWith('t='));
        const sigPart = parts.find(p => p.startsWith('v1='));
        if (!timestampPart || !sigPart)
            return false;
        const timestamp = timestampPart.split('=')[1];
        const expectedSig = sigPart.split('=')[1];
        const signedPayload = `${timestamp}.${payload.rawBody.toString()}`;
        const computedSig = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(signedPayload)
            .digest('hex');
        return crypto.timingSafeEqual(Buffer.from(computedSig), Buffer.from(expectedSig ?? ''));
    }
};
exports.StripeProvider = StripeProvider;
exports.StripeProvider = StripeProvider = StripeProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], StripeProvider);
//# sourceMappingURL=stripe.provider.js.map