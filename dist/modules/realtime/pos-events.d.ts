import type { PosSessionCart } from '../pos-sessions/entities/pos-session.entity';
export declare const POS_NAMESPACE = "/pos";
export declare function terminalRoom(terminalCode: string): string;
export declare function branchRoom(branchCode: string): string;
export declare const DISPATCH_ROOM = "dispatch";
export declare const PosServerEvent: {
    readonly SESSION_OPENED: "session:opened";
    readonly ITEM_ADDED: "session:item-added";
    readonly ITEM_UPDATED: "session:item-updated";
    readonly ITEM_REMOVED: "session:item-removed";
    readonly TOTALS_CHANGED: "session:totals-changed";
    readonly PAYMENT_INTENT: "session:payment-intent";
    readonly CONFIRMED: "session:confirmed";
    readonly VOIDED: "session:voided";
    readonly DISPATCH_NEW: "dispatch:new";
};
export type PosServerEvent = (typeof PosServerEvent)[keyof typeof PosServerEvent];
export declare const PosClientEvent: {
    readonly JOIN_TERMINAL: "terminal:join";
    readonly LEAVE_TERMINAL: "terminal:leave";
};
export type PosClientEvent = (typeof PosClientEvent)[keyof typeof PosClientEvent];
export interface SessionOpenedPayload {
    sessionId: string;
    terminalCode: string;
    branchCode: string;
    version: number;
    cart: PosSessionCart;
    openedByStaffId: string;
}
export interface SessionMutationPayload {
    sessionId: string;
    terminalCode: string;
    version: number;
    cart: PosSessionCart;
}
export interface SessionConfirmedPayload {
    sessionId: string;
    terminalCode: string;
    version: number;
    orderId: string;
    orderNumber: string;
}
export interface SessionVoidedPayload {
    sessionId: string;
    terminalCode: string;
    version: number;
    reason?: string;
}
export interface JoinTerminalPayload {
    terminalCode: string;
}
export interface DispatchNewPayload {
    orderId: string;
    orderNumber: string;
    channel: string;
    currency: string;
    grandTotal: number;
    itemCount: number;
    customerName: string;
    city?: string;
    state?: string;
    createdAt: string;
}
