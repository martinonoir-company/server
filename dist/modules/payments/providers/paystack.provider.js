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
var PaystackProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaystackProvider = void 0;
const common_1 = require("@nestjs/common");
const crypto = __importStar(require("crypto"));
const payment_provider_interface_1 = require("../interfaces/payment-provider.interface");
const base_entity_1 = require("../../../shared/entities/base.entity");
let PaystackProvider = PaystackProvider_1 = class PaystackProvider {
    constructor() {
        this.name = payment_provider_interface_1.PaymentProviderName.PAYSTACK;
        this.logger = new common_1.Logger(PaystackProvider_1.name);
        this.secretKey = process.env['PAYSTACK_SECRET_KEY'] ?? '';
        this.isLive = !!this.secretKey;
        if (!this.isLive) {
            this.logger.warn('PAYSTACK_SECRET_KEY not set — running in stub mode');
        }
    }
    async createPayment(input) {
        this.logger.log(`Creating Paystack payment for order ${input.orderNumber}: ${input.amount} ${input.currency}`);
        if (!this.isLive) {
            const reference = input.metadata?.['merchantReference'] ?? `PSK-${(0, base_entity_1.generateUlid)()}`;
            return {
                providerReference: reference,
                amount: input.amount,
                currency: input.currency,
                provider: this.name,
                status: payment_provider_interface_1.PaymentIntentStatus.REQUIRES_ACTION,
                checkoutUrl: `https://checkout.paystack.com/stub/${reference}`,
                metadata: { orderId: input.orderId, orderNumber: input.orderNumber },
            };
        }
        const reference = input.metadata?.['merchantReference'] ??
            `MN-${input.orderNumber}-${Date.now()}`;
        const body = JSON.stringify({
            email: input.customerEmail,
            amount: input.amount,
            currency: input.currency,
            reference,
            callback_url: input.callbackUrl,
            metadata: {
                orderId: input.orderId,
                orderNumber: input.orderNumber,
                customerName: input.customerName,
            },
        });
        const res = await fetch('https://api.paystack.co/transaction/initialize', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json',
            },
            body,
        });
        const data = await res.json();
        if (!data.status) {
            this.logger.error(`Paystack init failed: ${data.message}`);
            return {
                providerReference: '',
                amount: input.amount,
                currency: input.currency,
                provider: this.name,
                status: payment_provider_interface_1.PaymentIntentStatus.FAILED,
                metadata: { error: data.message },
            };
        }
        return {
            providerReference: data.data.reference,
            amount: input.amount,
            currency: input.currency,
            provider: this.name,
            status: payment_provider_interface_1.PaymentIntentStatus.REQUIRES_ACTION,
            checkoutUrl: data.data.authorization_url,
            metadata: { accessCode: data.data.access_code },
        };
    }
    async verifyPayment(input) {
        this.logger.log(`Verifying Paystack payment ${input.providerReference}`);
        if (!this.isLive) {
            return {
                providerReference: input.providerReference,
                amount: 0,
                currency: 'NGN',
                provider: this.name,
                status: payment_provider_interface_1.PaymentIntentStatus.SUCCEEDED,
            };
        }
        const res = await fetch(`https://api.paystack.co/transaction/verify/${input.providerReference}`, {
            headers: { 'Authorization': `Bearer ${this.secretKey}` },
        });
        const data = await res.json();
        const statusMap = {
            success: payment_provider_interface_1.PaymentIntentStatus.SUCCEEDED,
            failed: payment_provider_interface_1.PaymentIntentStatus.FAILED,
            abandoned: payment_provider_interface_1.PaymentIntentStatus.CANCELLED,
        };
        return {
            providerReference: input.providerReference,
            amount: data.data?.amount ?? 0,
            currency: data.data?.currency ?? 'NGN',
            provider: this.name,
            status: statusMap[data.data?.status] ?? payment_provider_interface_1.PaymentIntentStatus.PENDING,
            metadata: { gatewayResponse: data.data?.gateway_response },
        };
    }
    async refund(input) {
        this.logger.log(`Processing Paystack refund for ${input.providerReference}: ${input.amount}`);
        if (!this.isLive) {
            return {
                providerReference: input.providerReference,
                refundReference: `PSK-REF-${(0, base_entity_1.generateUlid)()}`,
                amount: input.amount,
                status: 'PENDING',
            };
        }
        const res = await fetch('https://api.paystack.co/refund', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                transaction: input.providerReference,
                amount: input.amount,
            }),
        });
        const data = await res.json();
        return {
            providerReference: input.providerReference,
            refundReference: data.data?.id?.toString() ?? `PSK-REF-${(0, base_entity_1.generateUlid)()}`,
            amount: input.amount,
            status: data.status ? 'PENDING' : 'FAILED',
        };
    }
    async resolveBankAccount(input) {
        if (!this.isLive) {
            return { accountName: `STUB ACCOUNT ${input.accountNumber.slice(-4)}` };
        }
        const url = new URL('https://api.paystack.co/bank/resolve');
        url.searchParams.set('account_number', input.accountNumber);
        url.searchParams.set('bank_code', input.bankCode);
        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${this.secretKey}` },
        });
        const data = (await res.json().catch(() => ({})));
        if (!data.status || !data.data?.account_name) {
            return { error: data.message ?? 'Could not verify account' };
        }
        return { accountName: data.data.account_name };
    }
    async listBanks() {
        if (!this.isLive) {
            return [
                { name: 'Access Bank', code: '044' },
                { name: 'GTBank', code: '058' },
                { name: 'Zenith Bank', code: '057' },
                { name: 'UBA', code: '033' },
                { name: 'First Bank', code: '011' },
            ];
        }
        const res = await fetch('https://api.paystack.co/bank?country=nigeria&currency=NGN', { headers: { Authorization: `Bearer ${this.secretKey}` } });
        const data = (await res.json().catch(() => ({})));
        return data.data ?? [];
    }
    async createTransferRecipient(input) {
        if (!this.isLive) {
            return { recipientCode: `RCP_STUB_${(0, base_entity_1.generateUlid)()}` };
        }
        const res = await fetch('https://api.paystack.co/transferrecipient', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'nuban',
                name: input.accountName,
                account_number: input.accountNumber,
                bank_code: input.bankCode,
                currency: 'NGN',
            }),
        });
        const data = (await res.json().catch(() => ({})));
        if (!data.status || !data.data?.recipient_code) {
            return { error: data.message ?? 'Could not create transfer recipient' };
        }
        return { recipientCode: data.data.recipient_code };
    }
    async initiateTransfer(input) {
        if (!this.isLive) {
            return { providerReference: `TRF_STUB_${(0, base_entity_1.generateUlid)()}`, status: 'PENDING' };
        }
        const res = await fetch('https://api.paystack.co/transfer', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                source: 'balance',
                amount: input.amount,
                recipient: input.recipientCode,
                reason: input.reason,
                reference: input.reference,
            }),
        });
        const data = (await res.json().catch(() => ({})));
        if (!data.status || !data.data?.transfer_code) {
            return { error: data.message ?? 'Transfer failed' };
        }
        return {
            providerReference: data.data.transfer_code,
            status: data.data.status === 'success' ? 'SUCCEEDED' : 'PENDING',
        };
    }
    verifyWebhookSignature(payload) {
        if (!this.isLive) {
            this.logger.log('[STUB] Paystack webhook signature verification bypassed');
            return true;
        }
        const hash = crypto
            .createHmac('sha512', this.secretKey)
            .update(payload.rawBody)
            .digest('hex');
        return hash === payload.signature;
    }
};
exports.PaystackProvider = PaystackProvider;
exports.PaystackProvider = PaystackProvider = PaystackProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], PaystackProvider);
//# sourceMappingURL=paystack.provider.js.map