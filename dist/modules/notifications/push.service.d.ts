import { Repository } from 'typeorm';
import { PushToken } from './entities/push-token.entity';
export interface PushPayload {
    title: string;
    body: string;
    data?: Record<string, unknown>;
    sound?: 'default' | null;
}
export interface PushSendResult {
    attempted: number;
    sent: number;
    skipped: number;
    invalidTokensDeactivated: number;
}
export declare class PushService {
    private readonly tokenRepo;
    private readonly logger;
    private readonly expo;
    constructor(tokenRepo: Repository<PushToken>);
    register(userId: string, expoPushToken: string, platform?: 'ios' | 'android', deviceLabel?: string): Promise<PushToken>;
    unregister(userId: string, expoPushToken: string): Promise<void>;
    unregisterAllForUser(userId: string): Promise<void>;
    sendToUser(userId: string | null | undefined, payload: PushPayload): Promise<PushSendResult>;
    sendToTokens(tokens: PushToken[], payload: PushPayload): Promise<PushSendResult>;
    private deactivateToken;
}
