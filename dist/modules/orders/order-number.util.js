"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextOrderNumber = nextOrderNumber;
exports.withUniqueOrderNumber = withUniqueOrderNumber;
const order_entity_1 = require("./entities/order.entity");
const PG_UNIQUE_VIOLATION = '23505';
function todayStamp(now = new Date()) {
    const y = now.getFullYear().toString().slice(-2);
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    return `${y}${m}${d}`;
}
async function nextOrderNumber(manager, prefix) {
    const stamp = todayStamp();
    const datePrefix = `${prefix}-${stamp}-`;
    const row = await manager
        .getRepository(order_entity_1.Order)
        .createQueryBuilder('o')
        .withDeleted()
        .select('MAX(o.orderNumber)', 'max')
        .where('o.orderNumber LIKE :p', { p: `${datePrefix}%` })
        .getRawOne();
    let nextSeq = 1;
    if (row?.max) {
        const tail = row.max.slice(datePrefix.length);
        const parsed = parseInt(tail, 10);
        if (Number.isFinite(parsed))
            nextSeq = parsed + 1;
    }
    return `${datePrefix}${nextSeq.toString().padStart(5, '0')}`;
}
async function withUniqueOrderNumber(manager, prefix, build, maxAttempts = 5) {
    let lastErr;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const orderNumber = await nextOrderNumber(manager, prefix);
        try {
            return await build(orderNumber);
        }
        catch (err) {
            lastErr = err;
            if (isOrderNumberConflict(err)) {
                continue;
            }
            throw err;
        }
    }
    throw lastErr;
}
function isOrderNumberConflict(err) {
    const e = err;
    const code = e?.code ?? e?.driverError?.code;
    if (code !== PG_UNIQUE_VIOLATION)
        return false;
    const msg = e?.message ?? '';
    return /orderNumber|IDX_59b0c3b34ea0fa5562342f2414/i.test(msg);
}
//# sourceMappingURL=order-number.util.js.map