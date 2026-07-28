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
var PushService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const expo_server_sdk_1 = require("expo-server-sdk");
const push_token_entity_1 = require("./entities/push-token.entity");
let PushService = PushService_1 = class PushService {
    constructor(tokenRepo) {
        this.tokenRepo = tokenRepo;
        this.logger = new common_1.Logger(PushService_1.name);
        const accessToken = process.env['EXPO_ACCESS_TOKEN'];
        this.expo = new expo_server_sdk_1.Expo(accessToken ? { accessToken } : {});
        this.logger.log(`Expo Push client initialised${accessToken ? ' (with access token)' : ' (anonymous mode)'}`);
    }
    async register(userId, expoPushToken, platform, deviceLabel) {
        const trimmed = expoPushToken.trim();
        const preview = trimmed.length > 30 ? `${trimmed.slice(0, 30)}...` : trimmed;
        if (!expo_server_sdk_1.Expo.isExpoPushToken(trimmed)) {
            this.logger.warn(`Rejected non-Expo token from user ${userId}: ${preview}`);
            throw new Error('Invalid Expo push token');
        }
        const existing = await this.tokenRepo.findOne({
            where: { userId, expoPushToken: trimmed, deletedAt: (0, typeorm_2.IsNull)() },
        });
        const now = new Date();
        if (existing) {
            existing.isActive = true;
            existing.platform = platform ?? existing.platform;
            existing.deviceLabel = deviceLabel ?? existing.deviceLabel;
            existing.lastUsedAt = now;
            return this.tokenRepo.save(existing);
        }
        const fresh = this.tokenRepo.create({
            userId,
            expoPushToken: trimmed,
            platform,
            deviceLabel,
            isActive: true,
            lastUsedAt: now,
        });
        return this.tokenRepo.save(fresh);
    }
    async unregister(userId, expoPushToken) {
        const trimmed = expoPushToken.trim();
        await this.tokenRepo.update({ userId, expoPushToken: trimmed, isActive: true, deletedAt: (0, typeorm_2.IsNull)() }, { isActive: false });
    }
    async unregisterAllForUser(userId) {
        await this.tokenRepo.update({ userId, isActive: true, deletedAt: (0, typeorm_2.IsNull)() }, { isActive: false });
    }
    async sendToUser(userId, payload) {
        const empty = {
            attempted: 0,
            sent: 0,
            skipped: 0,
            invalidTokensDeactivated: 0,
        };
        if (!userId)
            return empty;
        const tokens = await this.tokenRepo.find({
            where: { userId, isActive: true, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (tokens.length === 0) {
            this.logger.debug(`No active push tokens for user ${userId}`);
            return empty;
        }
        return this.sendToTokens(tokens, payload);
    }
    async sendToTokens(tokens, payload) {
        const result = {
            attempted: tokens.length,
            sent: 0,
            skipped: 0,
            invalidTokensDeactivated: 0,
        };
        if (tokens.length === 0)
            return result;
        const validTokens = [];
        const messages = [];
        for (const t of tokens) {
            if (!expo_server_sdk_1.Expo.isExpoPushToken(t.expoPushToken)) {
                result.skipped++;
                await this.deactivateToken(t.id);
                continue;
            }
            validTokens.push(t);
            messages.push({
                to: t.expoPushToken,
                sound: payload.sound === undefined ? 'default' : payload.sound,
                title: payload.title,
                body: payload.body,
                data: payload.data ?? {},
            });
        }
        if (messages.length === 0)
            return result;
        const chunks = this.expo.chunkPushNotifications(messages);
        const allTickets = [];
        for (const chunk of chunks) {
            try {
                const tickets = await this.expo.sendPushNotificationsAsync(chunk);
                allTickets.push(...tickets);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown';
                this.logger.error(`Expo Push chunk failed: ${msg}`);
                for (let i = 0; i < chunk.length; i++) {
                    allTickets.push({
                        status: 'error',
                        message: msg,
                        details: { error: 'ExpoError' },
                    });
                }
            }
        }
        for (let i = 0; i < validTokens.length; i++) {
            const ticket = allTickets[i];
            const token = validTokens[i];
            if (!ticket || !token)
                continue;
            if (ticket.status === 'ok') {
                result.sent++;
                await this.tokenRepo
                    .update({ id: token.id }, { lastUsedAt: new Date() })
                    .catch(() => {
                });
            }
            else {
                const code = ticket.details?.error;
                this.logger.warn(`Push ticket error for user=${token.userId} code=${code ?? 'unknown'}: ${ticket.message}`);
                if (code === 'DeviceNotRegistered') {
                    await this.deactivateToken(token.id);
                    result.invalidTokensDeactivated++;
                }
                else {
                    result.skipped++;
                }
            }
        }
        this.logger.log(`Push delivery summary: attempted=${result.attempted} sent=${result.sent} skipped=${result.skipped} invalid=${result.invalidTokensDeactivated}`);
        return result;
    }
    async deactivateToken(id) {
        await this.tokenRepo
            .update({ id }, { isActive: false })
            .catch((err) => {
            this.logger.error(`Failed to deactivate token ${id}: ${err instanceof Error ? err.message : err}`);
        });
    }
};
exports.PushService = PushService;
exports.PushService = PushService = PushService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(push_token_entity_1.PushToken)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], PushService);
//# sourceMappingURL=push.service.js.map