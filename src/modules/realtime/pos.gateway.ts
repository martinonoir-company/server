import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  DISPATCH_ROOM,
  DispatchNewPayload,
  JoinTerminalPayload,
  POS_NAMESPACE,
  PosClientEvent,
  PosServerEvent,
  SessionConfirmedPayload,
  SessionMutationPayload,
  SessionOpenedPayload,
  SessionVoidedPayload,
  terminalRoom,
} from './pos-events';

/**
 * Socket.IO gateway for the /pos namespace.
 *
 * Auth: the access token is read from the connection handshake
 * (`socket.handshake.auth.token` or `?token=`), verified ONCE at connect
 * with the same JWT secret + issuer the REST API uses. The decoded
 * identity is cached on the socket — no per-event DB hits.
 *
 * Rooms: keyed by terminal CODE. Clients call `terminal:join` after they
 * have opened a session via REST; the gateway only allows joining a room
 * (it does not validate branch assignment here — that's enforced by the
 * REST `open` endpoint, which is the only way a session exists at all).
 *
 * Emission: the PosSessionsService calls the public emit* methods on this
 * gateway after a successful REST mutation. REST writes, the gateway
 * notifies — single source of truth, no dual-write inconsistency.
 *
 * CORS: mirrors the REST CORS origins (CORS_ORIGINS env, comma-separated)
 * plus a permissive fallback in non-production for local dev.
 */
@WebSocketGateway({
  namespace: POS_NAMESPACE,
  cors: {
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => {
      const env = process.env['NODE_ENV'];
      if (env !== 'production') return cb(null, true);
      const allowed = (process.env['CORS_ORIGINS'] ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      // Same-origin requests (mobile apps, server-to-server) have no Origin.
      if (!origin) return cb(null, true);
      cb(null, allowed.includes(origin));
    },
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 30000,
})
export class PosGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(PosGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── Connection lifecycle ──

  handleConnection(client: Socket): void {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`Rejecting socket ${client.id}: no token`);
        client.disconnect(true);
        return;
      }
      const secret =
        this.config.get<string>('JWT_SECRET') ??
        'dev-secret-change-in-production';
      const payload = this.jwtService.verify<{
        sub: string;
        email?: string;
        role?: string;
      }>(token, { secret, issuer: 'martinonoir-api' });

      if (!payload?.sub) {
        this.logger.warn(`Rejecting socket ${client.id}: no sub in token`);
        client.disconnect(true);
        return;
      }
      // Cache identity on the socket — no per-event verification.
      client.data.userId = payload.sub;
      client.data.role = payload.role;
      // Every authenticated POS/staff socket joins the global dispatch room
      // so new-order dispatch alerts reach all terminals immediately.
      void client.join(DISPATCH_ROOM);
      this.logger.debug(
        `Socket ${client.id} connected (user=${payload.sub} role=${payload.role ?? '?'})`,
      );
    } catch (err) {
      this.logger.warn(
        `Rejecting socket ${client.id}: token verify failed — ${err instanceof Error ? err.message : err}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Socket ${client.id} disconnected`);
  }

  // ── Client → server (control plane) ──

  @SubscribeMessage(PosClientEvent.JOIN_TERMINAL)
  handleJoinTerminal(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinTerminalPayload,
  ): { ok: boolean; room?: string; error?: string } {
    const code = body?.terminalCode?.trim();
    if (!code) return { ok: false, error: 'terminalCode required' };
    const room = terminalRoom(code);
    void client.join(room);
    this.logger.debug(`Socket ${client.id} joined ${room}`);
    return { ok: true, room };
  }

  @SubscribeMessage(PosClientEvent.LEAVE_TERMINAL)
  handleLeaveTerminal(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinTerminalPayload,
  ): { ok: boolean } {
    const code = body?.terminalCode?.trim();
    if (code) {
      void client.leave(terminalRoom(code));
      this.logger.debug(`Socket ${client.id} left ${terminalRoom(code)}`);
    }
    return { ok: true };
  }

  // ── Server → room (called by PosSessionsService after a REST mutation) ──

  emitSessionOpened(terminalCode: string, payload: SessionOpenedPayload): void {
    this.server
      .to(terminalRoom(terminalCode))
      .emit(PosServerEvent.SESSION_OPENED, payload);
  }

  emitItemAdded(terminalCode: string, payload: SessionMutationPayload): void {
    const room = terminalRoom(terminalCode);
    this.server.to(room).emit(PosServerEvent.ITEM_ADDED, payload);
    this.server.to(room).emit(PosServerEvent.TOTALS_CHANGED, payload);
  }

  emitItemUpdated(terminalCode: string, payload: SessionMutationPayload): void {
    const room = terminalRoom(terminalCode);
    this.server.to(room).emit(PosServerEvent.ITEM_UPDATED, payload);
    this.server.to(room).emit(PosServerEvent.TOTALS_CHANGED, payload);
  }

  emitItemRemoved(terminalCode: string, payload: SessionMutationPayload): void {
    const room = terminalRoom(terminalCode);
    this.server.to(room).emit(PosServerEvent.ITEM_REMOVED, payload);
    this.server.to(room).emit(PosServerEvent.TOTALS_CHANGED, payload);
  }

  emitPaymentIntent(
    terminalCode: string,
    payload: SessionMutationPayload,
  ): void {
    this.server
      .to(terminalRoom(terminalCode))
      .emit(PosServerEvent.PAYMENT_INTENT, payload);
  }

  emitConfirmed(
    terminalCode: string,
    payload: SessionConfirmedPayload,
  ): void {
    this.server
      .to(terminalRoom(terminalCode))
      .emit(PosServerEvent.CONFIRMED, payload);
  }

  emitVoided(terminalCode: string, payload: SessionVoidedPayload): void {
    this.server
      .to(terminalRoom(terminalCode))
      .emit(PosServerEvent.VOIDED, payload);
  }

  /**
   * Broadcast a new dispatch order to every connected POS terminal. Safe to
   * call from anywhere (the OrdersService PAID hook): if the socket server
   * isn't ready yet it no-ops rather than throwing, so it can never break
   * the payment path.
   */
  emitDispatchNew(payload: DispatchNewPayload): void {
    try {
      this.server?.to(DISPATCH_ROOM).emit(PosServerEvent.DISPATCH_NEW, payload);
    } catch (err) {
      this.logger.warn(
        `emitDispatchNew failed (non-fatal): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // ── Helpers ──

  private extractToken(client: Socket): string | null {
    const fromAuth = client.handshake.auth?.['token'];
    if (typeof fromAuth === 'string' && fromAuth) return fromAuth;
    const fromQuery = client.handshake.query?.['token'];
    if (typeof fromQuery === 'string' && fromQuery) return fromQuery;
    const authHeader = client.handshake.headers?.['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length);
    }
    return null;
  }
}
