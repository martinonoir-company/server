import type { PosSessionCart } from '../pos-sessions/entities/pos-session.entity';

/**
 * Realtime event contract for the /pos namespace.
 *
 * Rooms are keyed by terminal CODE: `room:<terminalCode>`. Both the POS
 * web app and the scanner join the same room when they open a session on
 * that terminal. The server is the source of truth — REST writes, the
 * gateway notifies. Clients refetch (or apply the included diff) on each
 * event.
 */

export const POS_NAMESPACE = '/pos';

export function terminalRoom(terminalCode: string): string {
  return `room:${terminalCode.toUpperCase()}`;
}

export function branchRoom(branchCode: string): string {
  return `branch:${branchCode.toUpperCase()}`;
}

/**
 * Global dispatch room. Every POS terminal joins this room on connect so a
 * new shipping order anywhere triggers the dispatch alert on all terminals.
 * Kept global (not per-branch) because storefront/mobile orders have no
 * branch until staff sort them — any branch may handle the pickup.
 */
export const DISPATCH_ROOM = 'dispatch';

/** Events the SERVER emits into a terminal room. */
export const PosServerEvent = {
  SESSION_OPENED: 'session:opened',
  ITEM_ADDED: 'session:item-added',
  ITEM_UPDATED: 'session:item-updated',
  ITEM_REMOVED: 'session:item-removed',
  TOTALS_CHANGED: 'session:totals-changed',
  PAYMENT_INTENT: 'session:payment-intent',
  CONFIRMED: 'session:confirmed',
  VOIDED: 'session:voided',
  /** A new paid order that needs branch dispatch (storefront/mobile). */
  DISPATCH_NEW: 'dispatch:new',
} as const;
export type PosServerEvent =
  (typeof PosServerEvent)[keyof typeof PosServerEvent];

/** Events the CLIENT sends to the gateway (control-plane only). */
export const PosClientEvent = {
  /** Join the room for a terminal (after the session is open via REST). */
  JOIN_TERMINAL: 'terminal:join',
  /** Leave a terminal room. */
  LEAVE_TERMINAL: 'terminal:leave',
} as const;
export type PosClientEvent =
  (typeof PosClientEvent)[keyof typeof PosClientEvent];

// ── Event payloads ──

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

/** Payload for the dispatch:new alert pushed to all POS terminals. */
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
