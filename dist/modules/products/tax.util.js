"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SALES_TAX_RATE = void 0;
exports.addSalesTax = addSalesTax;
exports.addSalesTaxOptional = addSalesTaxOptional;
exports.SALES_TAX_RATE = 0.075;
function addSalesTax(priceMinor) {
    if (!Number.isFinite(priceMinor) || priceMinor <= 0)
        return priceMinor;
    return Math.round(priceMinor * (1 + exports.SALES_TAX_RATE));
}
function addSalesTaxOptional(priceMinor) {
    if (priceMinor === undefined || priceMinor === null)
        return undefined;
    return addSalesTax(priceMinor);
}
//# sourceMappingURL=tax.util.js.map