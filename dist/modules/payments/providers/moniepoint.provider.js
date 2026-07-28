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
var MoniepointProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MoniepointProvider = void 0;
const common_1 = require("@nestjs/common");
const payment_provider_interface_1 = require("../interfaces/payment-provider.interface");
const base_entity_1 = require("../../../shared/entities/base.entity");
const APPROVAL_RESPONSE_CODE = '00';
function isApproved(responseCode) {
    return (responseCode ?? '').trim() === APPROVAL_RESPONSE_CODE;
}
function mapProcessingStatus(s, responseCode) {
    switch (s) {
        case 'SUCCESSFUL':
        case 'COMPLETED':
        case 'PROCESSED':
            return isApproved(responseCode)
                ? payment_provider_interface_1.PaymentIntentStatus.SUCCEEDED
                : payment_provider_interface_1.PaymentIntentStatus.FAILED;
        case 'FAILED':
            return payment_provider_interface_1.PaymentIntentStatus.FAILED;
        case 'CANCELLED':
            return payment_provider_interface_1.PaymentIntentStatus.CANCELLED;
        case 'PENDING':
        default:
            return payment_provider_interface_1.PaymentIntentStatus.PENDING;
    }
}
let MoniepointProvider = MoniepointProvider_1 = class MoniepointProvider {
    constructor() {
        this.name = payment_provider_interface_1.PaymentProviderName.MONIEPOINT;
        this.logger = new common_1.Logger(MoniepointProvider_1.name);
        const raw = process.env['MONIEPOINT_API_KEY'] ?? '';
        this.apiKey = raw.trim().replace(/^["']|["']$/g, '');
        this.baseUrl = (process.env['MONIEPOINT_BASE_URL'] ?? 'https://api.pos.moniepoint.com').replace(/\/+$/, '');
        this.isLive = !!this.apiKey;
        if (!this.isLive) {
            this.logger.warn('MONIEPOINT_API_KEY not set — running in stub mode');
        }
        else if (raw !== this.apiKey) {
            this.logger.warn('MONIEPOINT_API_KEY had surrounding whitespace or quotes; trimmed before use.');
        }
    }
    async authedFetch(path, init) {
        return fetch(`${this.baseUrl}${path}`, {
            ...init,
            headers: {
                ...init.headers,
                Authorization: `Bearer ${this.apiKey}`,
            },
        });
    }
    async introspect() {
        if (!this.isLive) {
            return {
                ok: false,
                status: 0,
                body: { error: 'MONIEPOINT_API_KEY not set (stub mode)' },
            };
        }
        const res = await this.authedFetch('/v1/introspect', { method: 'GET' });
        let body;
        try {
            body = (await res.json());
        }
        catch {
            body = { error: `Non-JSON response (${res.status})` };
        }
        return { ok: res.ok, status: res.status, body };
    }
    async pushToTerminal(input) {
        this.logger.log(`Pushing ${input.amount} to terminal ${input.terminalSerial} (ref ${input.merchantReference})`);
        if (!this.isLive) {
            return {
                merchantReference: input.merchantReference,
                transactionReference: `MNP-STUB-${(0, base_entity_1.generateUlid)()}`,
                status: payment_provider_interface_1.PaymentIntentStatus.PROCESSING,
                message: 'Stub: pushed to terminal',
            };
        }
        try {
            const res = await this.authedFetch(`/v1/transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    terminalSerial: input.terminalSerial,
                    amount: input.amount,
                    merchantReference: input.merchantReference,
                    transactionType: 'PURCHASE',
                    paymentMethod: 'CARD_PURCHASE',
                }),
            });
            const data = (await res.json().catch(() => ({})));
            if (!res.ok) {
                this.logger.error(`Moniepoint push failed (${res.status}): ${JSON.stringify(data)}`);
                return {
                    merchantReference: input.merchantReference,
                    status: payment_provider_interface_1.PaymentIntentStatus.FAILED,
                    message: data['message'] ??
                        `Terminal push failed (${res.status})`,
                    raw: data,
                };
            }
            return {
                merchantReference: data['merchantReference'] ?? input.merchantReference,
                transactionReference: data['transactionReference'],
                status: mapProcessingStatus(data['processingStatus'], data['responseCode']),
                message: data['responseMessage'],
                raw: data,
            };
        }
        catch (err) {
            this.logger.error(`Moniepoint push error: ${err.message}`);
            return {
                merchantReference: input.merchantReference,
                status: payment_provider_interface_1.PaymentIntentStatus.FAILED,
                message: 'Could not reach the card terminal service',
            };
        }
    }
    async lookupTerminalTransaction(merchantReference) {
        if (!this.isLive) {
            return {
                merchantReference,
                transactionReference: `MNP-STUB-${merchantReference}`,
                status: payment_provider_interface_1.PaymentIntentStatus.SUCCEEDED,
                responseCode: '00',
                responseMessage: 'Stub: approved',
            };
        }
        try {
            const res = await this.authedFetch(`/v1/transactions/merchants/${encodeURIComponent(merchantReference)}`, { method: 'GET' });
            const data = (await res.json().catch(() => ({})));
            if (!res.ok) {
                this.logger.warn(`Moniepoint lookup ${res.status} for ${merchantReference}: ${JSON.stringify(data)}`);
                return {
                    merchantReference,
                    status: payment_provider_interface_1.PaymentIntentStatus.PENDING,
                    responseMessage: data['message'] ?? `Lookup returned ${res.status}`,
                    raw: data,
                };
            }
            this.logger.log(`Moniepoint lookup ${merchantReference}: ` +
                `processingStatus=${data['processingStatus']} ` +
                `responseCode=${data['responseCode']} ` +
                `actualAmount=${data['actualAmount']}`);
            const actualAmount = typeof data['actualAmount'] === 'number'
                ? data['actualAmount']
                : typeof data['requestAmount'] === 'number'
                    ? data['requestAmount']
                    : undefined;
            return {
                merchantReference: data['merchantReference'] ?? merchantReference,
                transactionReference: data['transactionReference'],
                status: mapProcessingStatus(data['processingStatus'], data['responseCode']),
                actualAmount,
                responseCode: data['responseCode'],
                responseMessage: data['responseMessage'],
                raw: data,
            };
        }
        catch (err) {
            this.logger.error(`Moniepoint lookup error for ${merchantReference}: ${err.message}`);
            return { merchantReference, status: payment_provider_interface_1.PaymentIntentStatus.PENDING };
        }
    }
    async createPayment(input) {
        this.logger.warn('MoniepointProvider.createPayment is not supported — use pushToTerminal');
        return {
            providerReference: '',
            amount: input.amount,
            currency: input.currency,
            provider: this.name,
            status: payment_provider_interface_1.PaymentIntentStatus.FAILED,
            metadata: { error: 'Moniepoint is a POS-terminal provider' },
        };
    }
    async verifyPayment(input) {
        const result = await this.lookupTerminalTransaction(input.providerReference);
        return {
            providerReference: result.transactionReference ?? input.providerReference,
            amount: result.actualAmount ?? 0,
            currency: 'NGN',
            provider: this.name,
            status: result.status,
            metadata: {
                gatewayResponse: result.responseMessage,
                responseCode: result.responseCode,
                ...(result.raw ?? {}),
            },
        };
    }
    async refund(input) {
        this.logger.log(`Moniepoint refund recorded for ${input.providerReference} (manual reversal required)`);
        return {
            providerReference: input.providerReference,
            refundReference: `MNP-REF-${(0, base_entity_1.generateUlid)()}`,
            amount: input.amount,
            status: 'PENDING',
        };
    }
    verifyWebhookSignature(_payload) {
        return true;
    }
};
exports.MoniepointProvider = MoniepointProvider;
exports.MoniepointProvider = MoniepointProvider = MoniepointProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], MoniepointProvider);
//# sourceMappingURL=moniepoint.provider.js.map