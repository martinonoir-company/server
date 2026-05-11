import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { PushToken } from './entities/push-token.entity';

/**
 * One notification to send. Goes to ALL active tokens for a user.
 */
export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Override sound. 'default' on iOS plays the device default. */
  sound?: 'default' | null;
}

export interface PushSendResult {
  attempted: number;
  sent: number;
  skipped: number;
  invalidTokensDeactivated: number;
}

/**
 * Expo Push integration for storefront mobile customer notifications.
 *
 *  - register / unregister tokens via REST.
 *  - sendToUser fires a payload to every active token a user has.
 *  - Failure handling mirrors the EmailService pattern: missing config
 *    falls back to console logging. DeviceNotRegistered tickets cause
 *    the offending token row to flip `isActive = false`.
 *
 * Wired into OrdersService:
 *   - on POST /orders/:id/dispatch    → "Your order is on its way"
 *   - on POST /orders/:id/delivered   → "Your order arrived"
 *
 * Guest orders (no userId) silently skip — there's nothing to send to.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly expo: Expo;

  constructor(
    @InjectRepository(PushToken)
    private readonly tokenRepo: Repository<PushToken>,
  ) {
    // Expo accepts an access token for higher rate limits; optional.
    const accessToken = process.env['EXPO_ACCESS_TOKEN'];
    this.expo = new Expo(accessToken ? { accessToken } : {});
    this.logger.log(
      `Expo Push client initialised${accessToken ? ' (with access token)' : ' (anonymous mode)'}`,
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Token lifecycle
  // ─────────────────────────────────────────────────────────────

  /**
   * Register or re-activate a (userId, expoPushToken) pair. Idempotent —
   * called by the storefront app on every authenticated app launch.
   *
   *  - New token → INSERT.
   *  - Existing active row → bump lastUsedAt, update platform/label.
   *  - Existing inactive row → reactivate (isActive=true) and bump.
   */
  async register(
    userId: string,
    expoPushToken: string,
    platform?: 'ios' | 'android',
    deviceLabel?: string,
  ): Promise<PushToken> {
    const trimmed = expoPushToken.trim();
    const preview =
      trimmed.length > 30 ? `${trimmed.slice(0, 30)}...` : trimmed;
    if (!Expo.isExpoPushToken(trimmed)) {
      this.logger.warn(
        `Rejected non-Expo token from user ${userId}: ${preview}`,
      );
      throw new Error('Invalid Expo push token');
    }

    const existing = await this.tokenRepo.findOne({
      where: { userId, expoPushToken: trimmed, deletedAt: IsNull() },
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

  /**
   * Mark a token inactive. Called on app logout. Soft — the row stays
   * for audit and can be reactivated later via register().
   */
  async unregister(userId: string, expoPushToken: string): Promise<void> {
    const trimmed = expoPushToken.trim();
    await this.tokenRepo.update(
      { userId, expoPushToken: trimmed, isActive: true, deletedAt: IsNull() },
      { isActive: false },
    );
  }

  /**
   * Mark all of a user's tokens inactive. Useful when their account is
   * deleted or all sessions revoked.
   */
  async unregisterAllForUser(userId: string): Promise<void> {
    await this.tokenRepo.update(
      { userId, isActive: true, deletedAt: IsNull() },
      { isActive: false },
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Send
  // ─────────────────────────────────────────────────────────────

  /**
   * Send a notification to every active token a user has. Returns a
   * summary; never throws — errors are logged and DeviceNotRegistered
   * tokens are auto-deactivated.
   *
   * Returns a no-op result when:
   *   - userId is null/undefined (guest order).
   *   - The user has no active tokens.
   */
  async sendToUser(
    userId: string | null | undefined,
    payload: PushPayload,
  ): Promise<PushSendResult> {
    const empty: PushSendResult = {
      attempted: 0,
      sent: 0,
      skipped: 0,
      invalidTokensDeactivated: 0,
    };

    if (!userId) return empty;

    const tokens = await this.tokenRepo.find({
      where: { userId, isActive: true, deletedAt: IsNull() },
    });

    if (tokens.length === 0) {
      this.logger.debug(`No active push tokens for user ${userId}`);
      return empty;
    }

    return this.sendToTokens(tokens, payload);
  }

  /**
   * Lower-level send. Used by sendToUser; exposed so admin batch tools
   * could broadcast to a curated token list later.
   */
  async sendToTokens(
    tokens: PushToken[],
    payload: PushPayload,
  ): Promise<PushSendResult> {
    const result: PushSendResult = {
      attempted: tokens.length,
      sent: 0,
      skipped: 0,
      invalidTokensDeactivated: 0,
    };

    if (tokens.length === 0) return result;

    // Build messages. Filter any non-Expo tokens defensively (in case the
    // DB picked up something stale).
    const validTokens: PushToken[] = [];
    const messages: ExpoPushMessage[] = [];
    for (const t of tokens) {
      if (!Expo.isExpoPushToken(t.expoPushToken)) {
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

    if (messages.length === 0) return result;

    // Send in chunks (the SDK handles the size limit).
    const chunks = this.expo.chunkPushNotifications(messages);
    const allTickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        allTickets.push(...tickets);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown';
        this.logger.error(`Expo Push chunk failed: ${msg}`);
        // We don't know which message in the chunk failed — push placeholders
        // so the per-token loop below stays index-aligned.
        for (let i = 0; i < chunk.length; i++) {
          allTickets.push({
            status: 'error',
            message: msg,
            details: { error: 'ExpoError' as const },
          });
        }
      }
    }

    // Walk tickets in lockstep with validTokens. Each ticket maps 1:1
    // to the message at the same index.
    for (let i = 0; i < validTokens.length; i++) {
      const ticket = allTickets[i];
      const token = validTokens[i];
      if (!ticket || !token) continue;

      if (ticket.status === 'ok') {
        result.sent++;
        // Bump lastUsedAt — non-blocking, best effort.
        await this.tokenRepo
          .update({ id: token.id }, { lastUsedAt: new Date() })
          .catch(() => {
            /* ignore */
          });
      } else {
        // status === 'error'
        const code = ticket.details?.error;
        this.logger.warn(
          `Push ticket error for user=${token.userId} code=${code ?? 'unknown'}: ${ticket.message}`,
        );
        if (code === 'DeviceNotRegistered') {
          await this.deactivateToken(token.id);
          result.invalidTokensDeactivated++;
        } else {
          result.skipped++;
        }
      }
    }

    this.logger.log(
      `Push delivery summary: attempted=${result.attempted} sent=${result.sent} skipped=${result.skipped} invalid=${result.invalidTokensDeactivated}`,
    );
    return result;
  }

  private async deactivateToken(id: string): Promise<void> {
    await this.tokenRepo
      .update({ id }, { isActive: false })
      .catch((err) => {
        this.logger.error(
          `Failed to deactivate token ${id}: ${err instanceof Error ? err.message : err}`,
        );
      });
  }
}
