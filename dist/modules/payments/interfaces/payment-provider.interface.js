"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentIntentStatus = exports.PaymentProviderName = void 0;
var PaymentProviderName;
(function (PaymentProviderName) {
    PaymentProviderName["MONIEPOINT"] = "MONIEPOINT";
    PaymentProviderName["PAYSTACK"] = "PAYSTACK";
    PaymentProviderName["STRIPE"] = "STRIPE";
})(PaymentProviderName || (exports.PaymentProviderName = PaymentProviderName = {}));
var PaymentIntentStatus;
(function (PaymentIntentStatus) {
    PaymentIntentStatus["PENDING"] = "PENDING";
    PaymentIntentStatus["REQUIRES_ACTION"] = "REQUIRES_ACTION";
    PaymentIntentStatus["PROCESSING"] = "PROCESSING";
    PaymentIntentStatus["SUCCEEDED"] = "SUCCEEDED";
    PaymentIntentStatus["FAILED"] = "FAILED";
    PaymentIntentStatus["CANCELLED"] = "CANCELLED";
})(PaymentIntentStatus || (exports.PaymentIntentStatus = PaymentIntentStatus = {}));
//# sourceMappingURL=payment-provider.interface.js.map