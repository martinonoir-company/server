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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefundRequestItem = exports.RefundRequest = exports.RefundMethod = exports.RefundStatus = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../shared/entities/base.entity");
const order_entity_1 = require("../../orders/entities/order.entity");
const payment_entity_1 = require("../../payments/entities/payment.entity");
var RefundStatus;
(function (RefundStatus) {
    RefundStatus["PENDING"] = "PENDING";
    RefundStatus["APPROVED"] = "APPROVED";
    RefundStatus["PROCESSING"] = "PROCESSING";
    RefundStatus["SUCCEEDED"] = "SUCCEEDED";
    RefundStatus["FAILED"] = "FAILED";
    RefundStatus["REJECTED"] = "REJECTED";
    RefundStatus["COMPLETED_BY_STAFF"] = "COMPLETED_BY_STAFF";
})(RefundStatus || (exports.RefundStatus = RefundStatus = {}));
var RefundMethod;
(function (RefundMethod) {
    RefundMethod["PAYSTACK_REFUND"] = "PAYSTACK_REFUND";
    RefundMethod["PAYSTACK_TRANSFER"] = "PAYSTACK_TRANSFER";
    RefundMethod["CASH"] = "CASH";
})(RefundMethod || (exports.RefundMethod = RefundMethod = {}));
let RefundRequest = class RefundRequest extends base_entity_1.BaseEntity {
};
exports.RefundRequest = RefundRequest;
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26 }),
    __metadata("design:type", String)
], RefundRequest.prototype, "orderId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => order_entity_1.Order, { onDelete: 'RESTRICT' }),
    (0, typeorm_1.JoinColumn)({ name: 'orderId' }),
    __metadata("design:type", order_entity_1.Order)
], RefundRequest.prototype, "order", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26, nullable: true }),
    __metadata("design:type", Object)
], RefundRequest.prototype, "originalPaymentId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => payment_entity_1.Payment, { onDelete: 'SET NULL', nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'originalPaymentId' }),
    __metadata("design:type", Object)
], RefundRequest.prototype, "originalPayment", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: payment_entity_1.PaymentChannel }),
    __metadata("design:type", String)
], RefundRequest.prototype, "channel", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], RefundRequest.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 3, default: 'NGN' }),
    __metadata("design:type", String)
], RefundRequest.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], RefundRequest.prototype, "itemsCount", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ type: 'enum', enum: RefundStatus, default: RefundStatus.PENDING }),
    __metadata("design:type", String)
], RefundRequest.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: RefundMethod }),
    __metadata("design:type", String)
], RefundRequest.prototype, "method", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], RefundRequest.prototype, "reason", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26, nullable: true }),
    __metadata("design:type", String)
], RefundRequest.prototype, "requestedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26, nullable: true }),
    __metadata("design:type", Object)
], RefundRequest.prototype, "decidedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], RefundRequest.prototype, "decidedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], RefundRequest.prototype, "decisionReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 10, nullable: true }),
    __metadata("design:type", Object)
], RefundRequest.prototype, "bankCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, nullable: true }),
    __metadata("design:type", Object)
], RefundRequest.prototype, "bankAccountNumber", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 200, nullable: true }),
    __metadata("design:type", Object)
], RefundRequest.prototype, "bankAccountName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], RefundRequest.prototype, "providerReference", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], RefundRequest.prototype, "transferRecipientCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], RefundRequest.prototype, "failureReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], RefundRequest.prototype, "refundedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], RefundRequest.prototype, "rawProviderData", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => RefundRequestItem, (item) => item.refundRequest, {
        cascade: true,
    }),
    __metadata("design:type", Array)
], RefundRequest.prototype, "items", void 0);
exports.RefundRequest = RefundRequest = __decorate([
    (0, typeorm_1.Entity)('refund_requests'),
    (0, typeorm_1.Index)(['status', 'createdAt']),
    (0, typeorm_1.Index)(['orderId'])
], RefundRequest);
let RefundRequestItem = class RefundRequestItem extends base_entity_1.BaseEntity {
};
exports.RefundRequestItem = RefundRequestItem;
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26 }),
    __metadata("design:type", String)
], RefundRequestItem.prototype, "refundRequestId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => RefundRequest, (r) => r.items, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'refundRequestId' }),
    __metadata("design:type", RefundRequest)
], RefundRequestItem.prototype, "refundRequest", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26, nullable: true }),
    __metadata("design:type", Object)
], RefundRequestItem.prototype, "orderItemId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26 }),
    __metadata("design:type", String)
], RefundRequestItem.prototype, "variantId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 200 }),
    __metadata("design:type", String)
], RefundRequestItem.prototype, "productName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 200, nullable: true }),
    __metadata("design:type", String)
], RefundRequestItem.prototype, "variantName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100 }),
    __metadata("design:type", String)
], RefundRequestItem.prototype, "sku", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], RefundRequestItem.prototype, "quantity", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], RefundRequestItem.prototype, "unitPrice", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], RefundRequestItem.prototype, "lineTotal", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", String)
], RefundRequestItem.prototype, "reasonCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], RefundRequestItem.prototype, "reasonNote", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26, nullable: true }),
    __metadata("design:type", Object)
], RefundRequestItem.prototype, "stockMovementId", void 0);
exports.RefundRequestItem = RefundRequestItem = __decorate([
    (0, typeorm_1.Entity)('refund_request_items'),
    (0, typeorm_1.Index)(['refundRequestId'])
], RefundRequestItem);
//# sourceMappingURL=refund-request.entity.js.map