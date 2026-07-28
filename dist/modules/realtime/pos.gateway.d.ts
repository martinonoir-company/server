import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DispatchNewPayload, JoinTerminalPayload, SessionConfirmedPayload, SessionMutationPayload, SessionOpenedPayload, SessionVoidedPayload } from './pos-events';
export declare class PosGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly jwtService;
    private readonly config;
    private readonly logger;
    server: Server;
    constructor(jwtService: JwtService, config: ConfigService);
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleJoinTerminal(client: Socket, body: JoinTerminalPayload): {
        ok: boolean;
        room?: string;
        error?: string;
    };
    handleLeaveTerminal(client: Socket, body: JoinTerminalPayload): {
        ok: boolean;
    };
    emitSessionOpened(terminalCode: string, payload: SessionOpenedPayload): void;
    emitItemAdded(terminalCode: string, payload: SessionMutationPayload): void;
    emitItemUpdated(terminalCode: string, payload: SessionMutationPayload): void;
    emitItemRemoved(terminalCode: string, payload: SessionMutationPayload): void;
    emitPaymentIntent(terminalCode: string, payload: SessionMutationPayload): void;
    emitConfirmed(terminalCode: string, payload: SessionConfirmedPayload): void;
    emitVoided(terminalCode: string, payload: SessionVoidedPayload): void;
    emitDispatchNew(payload: DispatchNewPayload): void;
    private extractToken;
}
