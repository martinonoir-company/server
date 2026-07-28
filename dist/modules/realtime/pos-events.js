"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PosClientEvent = exports.PosServerEvent = exports.DISPATCH_ROOM = exports.POS_NAMESPACE = void 0;
exports.terminalRoom = terminalRoom;
exports.branchRoom = branchRoom;
exports.POS_NAMESPACE = '/pos';
function terminalRoom(terminalCode) {
    return `room:${terminalCode.toUpperCase()}`;
}
function branchRoom(branchCode) {
    return `branch:${branchCode.toUpperCase()}`;
}
exports.DISPATCH_ROOM = 'dispatch';
exports.PosServerEvent = {
    SESSION_OPENED: 'session:opened',
    ITEM_ADDED: 'session:item-added',
    ITEM_UPDATED: 'session:item-updated',
    ITEM_REMOVED: 'session:item-removed',
    TOTALS_CHANGED: 'session:totals-changed',
    PAYMENT_INTENT: 'session:payment-intent',
    CONFIRMED: 'session:confirmed',
    VOIDED: 'session:voided',
    DISPATCH_NEW: 'dispatch:new',
};
exports.PosClientEvent = {
    JOIN_TERMINAL: 'terminal:join',
    LEAVE_TERMINAL: 'terminal:leave',
};
//# sourceMappingURL=pos-events.js.map