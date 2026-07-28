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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PosGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PosGateway = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const pos_events_1 = require("./pos-events");
let PosGateway = PosGateway_1 = class PosGateway {
    constructor(jwtService, config) {
        this.jwtService = jwtService;
        this.config = config;
        this.logger = new common_1.Logger(PosGateway_1.name);
    }
    handleConnection(client) {
        try {
            const token = this.extractToken(client);
            if (!token) {
                this.logger.warn(`Rejecting socket ${client.id}: no token`);
                client.disconnect(true);
                return;
            }
            const secret = this.config.get('JWT_SECRET') ??
                'dev-secret-change-in-production';
            const payload = this.jwtService.verify(token, { secret, issuer: 'martinonoir-api' });
            if (!payload?.sub) {
                this.logger.warn(`Rejecting socket ${client.id}: no sub in token`);
                client.disconnect(true);
                return;
            }
            client.data.userId = payload.sub;
            client.data.role = payload.role;
            void client.join(pos_events_1.DISPATCH_ROOM);
            this.logger.debug(`Socket ${client.id} connected (user=${payload.sub} role=${payload.role ?? '?'})`);
        }
        catch (err) {
            this.logger.warn(`Rejecting socket ${client.id}: token verify failed — ${err instanceof Error ? err.message : err}`);
            client.disconnect(true);
        }
    }
    handleDisconnect(client) {
        this.logger.debug(`Socket ${client.id} disconnected`);
    }
    handleJoinTerminal(client, body) {
        const code = body?.terminalCode?.trim();
        if (!code)
            return { ok: false, error: 'terminalCode required' };
        const room = (0, pos_events_1.terminalRoom)(code);
        void client.join(room);
        this.logger.debug(`Socket ${client.id} joined ${room}`);
        return { ok: true, room };
    }
    handleLeaveTerminal(client, body) {
        const code = body?.terminalCode?.trim();
        if (code) {
            void client.leave((0, pos_events_1.terminalRoom)(code));
            this.logger.debug(`Socket ${client.id} left ${(0, pos_events_1.terminalRoom)(code)}`);
        }
        return { ok: true };
    }
    emitSessionOpened(terminalCode, payload) {
        this.server
            .to((0, pos_events_1.terminalRoom)(terminalCode))
            .emit(pos_events_1.PosServerEvent.SESSION_OPENED, payload);
    }
    emitItemAdded(terminalCode, payload) {
        const room = (0, pos_events_1.terminalRoom)(terminalCode);
        this.server.to(room).emit(pos_events_1.PosServerEvent.ITEM_ADDED, payload);
        this.server.to(room).emit(pos_events_1.PosServerEvent.TOTALS_CHANGED, payload);
    }
    emitItemUpdated(terminalCode, payload) {
        const room = (0, pos_events_1.terminalRoom)(terminalCode);
        this.server.to(room).emit(pos_events_1.PosServerEvent.ITEM_UPDATED, payload);
        this.server.to(room).emit(pos_events_1.PosServerEvent.TOTALS_CHANGED, payload);
    }
    emitItemRemoved(terminalCode, payload) {
        const room = (0, pos_events_1.terminalRoom)(terminalCode);
        this.server.to(room).emit(pos_events_1.PosServerEvent.ITEM_REMOVED, payload);
        this.server.to(room).emit(pos_events_1.PosServerEvent.TOTALS_CHANGED, payload);
    }
    emitPaymentIntent(terminalCode, payload) {
        this.server
            .to((0, pos_events_1.terminalRoom)(terminalCode))
            .emit(pos_events_1.PosServerEvent.PAYMENT_INTENT, payload);
    }
    emitConfirmed(terminalCode, payload) {
        this.server
            .to((0, pos_events_1.terminalRoom)(terminalCode))
            .emit(pos_events_1.PosServerEvent.CONFIRMED, payload);
    }
    emitVoided(terminalCode, payload) {
        this.server
            .to((0, pos_events_1.terminalRoom)(terminalCode))
            .emit(pos_events_1.PosServerEvent.VOIDED, payload);
    }
    emitDispatchNew(payload) {
        try {
            if (!this.server) {
                this.logger.warn('emitDispatchNew: socket server not ready');
                return;
            }
            this.server.to(pos_events_1.DISPATCH_ROOM).emit(pos_events_1.PosServerEvent.DISPATCH_NEW, payload);
            const room = this.server.sockets.adapter.rooms.get(pos_events_1.DISPATCH_ROOM);
            this.logger.log(`dispatch:new emitted for ${payload.orderNumber} to ${room?.size ?? 0} client(s) in '${pos_events_1.DISPATCH_ROOM}'`);
        }
        catch (err) {
            this.logger.warn(`emitDispatchNew failed (non-fatal): ${err instanceof Error ? err.message : err}`);
        }
    }
    extractToken(client) {
        const fromAuth = client.handshake.auth?.['token'];
        if (typeof fromAuth === 'string' && fromAuth)
            return fromAuth;
        const fromQuery = client.handshake.query?.['token'];
        if (typeof fromQuery === 'string' && fromQuery)
            return fromQuery;
        const authHeader = client.handshake.headers?.['authorization'];
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
            return authHeader.slice('Bearer '.length);
        }
        return null;
    }
};
exports.PosGateway = PosGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], PosGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)(pos_events_1.PosClientEvent.JOIN_TERMINAL),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Object)
], PosGateway.prototype, "handleJoinTerminal", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(pos_events_1.PosClientEvent.LEAVE_TERMINAL),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Object)
], PosGateway.prototype, "handleLeaveTerminal", null);
exports.PosGateway = PosGateway = PosGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        namespace: pos_events_1.POS_NAMESPACE,
        cors: {
            origin: (origin, cb) => {
                const env = process.env['NODE_ENV'];
                if (env !== 'production')
                    return cb(null, true);
                const allowed = (process.env['CORS_ORIGINS'] ?? '')
                    .split(',')
                    .map((o) => o.trim())
                    .filter(Boolean);
                if (!origin)
                    return cb(null, true);
                cb(null, allowed.includes(origin));
            },
            credentials: true,
        },
        pingInterval: 25000,
        pingTimeout: 30000,
    }),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        config_1.ConfigService])
], PosGateway);
//# sourceMappingURL=pos.gateway.js.map