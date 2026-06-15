import { Injectable, Logger } from '@nestjs/common';
import {
  IPaymentProvider,
  PaymentProviderName,
  PaymentIntent,
  PaymentIntentStatus,
  CreatePaymentInput,
  VerifyPaymentInput,
  RefundInput,
  RefundResult,
  WebhookPayload,
} from '../interfaces/payment-provider.interface';
import { generateUlid } from '../../../shared/entities/base.entity';

/**
 * Moniepoint POS Terminal provider.
 *
 * Integrates the Moniepoint POS API (https://api.pos.moniepoint.com,
 * OpenAPI v3):
 *   - POST /v1/transactions                       — push a card payment to
 *                                                   a physical terminal
 *   - GET  /v1/transactions/merchants/{ref}       — authoritative status
 *
 * Auth: a bearer API key (JWT) scoped `transaction:push` + `transaction:read`.
 *
 * Set MONIEPOINT_API_KEY to go live. Without it, runs in stub mode that
 * mirrors the real shapes so the full flow is exercisable end-to-end.
 */

/** Result of pushing a card transaction to a terminal. */
export interface TerminalPushResult {
  /** Echoes our merchantReference — the key to poll status with. */
  merchantReference: string;
  /** Moniepoint's own transaction reference, once assigned. */
  transactionReference?: string;
  /** Mapped lifecycle status. */
  status: PaymentIntentStatus;
  /** Provider message, if any. */
  message?: string;
  /** Raw provider response, kept for audit. */
  raw?: Record<string, unknown>;
}

/** Result of a terminal transaction status lookup. */
export interface TerminalStatusResult {
  merchantReference: string;
  transactionReference?: string;
  status: PaymentIntentStatus;
  /** Actual amount captured, minor units. */
  actualAmount?: number;
  responseCode?: string;
  responseMessage?: string;
  raw?: Record<string, unknown>;
}

/** Moniepoint processingStatus -> our PaymentIntentStatus. */
function mapProcessingStatus(s: string | undefined): PaymentIntentStatus {
  switch (s) {
    case 'SUCCESSFUL':
    case 'COMPLETED':
      return PaymentIntentStatus.SUCCEEDED;
    case 'FAILED':
      return PaymentIntentStatus.FAILED;
    case 'CANCELLED':
      return PaymentIntentStatus.CANCELLED;
    case 'PROCESSED':
      return PaymentIntentStatus.PROCESSING;
    case 'PENDING':
    default:
      return PaymentIntentStatus.PENDING;
  }
}

/** Cached OAuth access token. */
interface CachedToken {
  token: string;
  /** Epoch ms after which the token must not be used. */
  expiresAt: number;
}

@Injectable()
export class MoniepointProvider implements IPaymentProvider {
  readonly name = PaymentProviderName.MONIEPOINT;
  private readonly logger = new Logger(MoniepointProvider.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;
  private readonly tokenUrl: string;
  private readonly isLive: boolean;

  /**
   * In-memory access-token cache. Moniepoint POS auth is OAuth
   * client-credentials — we exchange clientId+clientSecret for a
   * short-lived bearer token, cache it until just before expiry, and
   * refresh on demand or on a 401.
   */
  private cachedToken: CachedToken | null = null;
  private tokenFetchInFlight: Promise<string> | null = null;
  /** Refresh the token this many ms before its real expiry. */
  private static readonly TOKEN_SKEW_MS = 30_000;

  constructor() {
    this.clientId = process.env['MONIEPOINT_CLIENT_ID'] ?? '';
    this.clientSecret = process.env['MONIEPOINT_CLIENT_SECRET'] ?? '';
    this.baseUrl =
      process.env['MONIEPOINT_BASE_URL'] ?? 'https://api.pos.moniepoint.com';
    // Default to the same host's /oauth/token; override only if Moniepoint
    // hosts their auth on a separate domain in your environment.
    this.tokenUrl =
      process.env['MONIEPOINT_TOKEN_URL'] ?? `${this.baseUrl}/oauth/token`;
    this.isLive = !!(this.clientId && this.clientSecret);
    if (!this.isLive) {
      this.logger.warn(
        'MONIEPOINT_CLIENT_ID / MONIEPOINT_CLIENT_SECRET not set — running in stub mode',
      );
    }
  }

  /**
   * Get a valid access token, refreshing if it's missing or near expiry.
   * Concurrent callers share a single refresh attempt so we don't fire
   * multiple token requests under load.
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now) {
      return this.cachedToken.token;
    }
    if (this.tokenFetchInFlight) return this.tokenFetchInFlight;

    this.tokenFetchInFlight = this.fetchAccessToken()
      .then((tok) => {
        this.cachedToken = tok;
        return tok.token;
      })
      .finally(() => {
        this.tokenFetchInFlight = null;
      });
    return this.tokenFetchInFlight;
  }

  /** Force a token refresh on the next call (used after a 401). */
  private invalidateToken(): void {
    this.cachedToken = null;
  }

  /**
   * Exchange client credentials for an access token. Moniepoint returns
   * `{ accessToken, tokenType: "bearer", expiresIn, scope, jti }`.
   */
  private async fetchAccessToken(): Promise<CachedToken> {
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString(
      'base64',
    );
    const body = new URLSearchParams({ grant_type: 'client_credentials' });

    const res = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      this.logger.error(
        `Moniepoint token exchange failed (${res.status}): ${JSON.stringify(data)}`,
      );
      throw new Error(
        (data['error_description'] as string) ??
          (data['message'] as string) ??
          `Token exchange failed (${res.status})`,
      );
    }
    const token =
      (data['accessToken'] as string) ?? (data['access_token'] as string);
    const expiresIn =
      (data['expiresIn'] as number) ?? (data['expires_in'] as number) ?? 300;
    if (!token) {
      throw new Error('Moniepoint token response missing accessToken');
    }
    return {
      token,
      expiresAt:
        Date.now() + Math.max(0, expiresIn * 1000 - MoniepointProvider.TOKEN_SKEW_MS),
    };
  }

  /**
   * Authenticated fetch against the Moniepoint POS API. Attaches a fresh
   * bearer token and retries once on 401 with a forced token refresh.
   */
  private async authedFetch(
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    const doFetch = async (token: string) =>
      fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${token}`,
        },
      });

    let token = await this.getAccessToken();
    let res = await doFetch(token);
    if (res.status === 401) {
      this.invalidateToken();
      token = await this.getAccessToken();
      res = await doFetch(token);
    }
    return res;
  }

  // ── POS terminal API ──

  /**
   * Push a card payment to a physical Moniepoint terminal.
   * The terminal then prompts the customer to tap/insert their card.
   */
  async pushToTerminal(input: {
    terminalSerial: string;
    amount: number; // minor units (kobo)
    merchantReference: string;
  }): Promise<TerminalPushResult> {
    this.logger.log(
      `Pushing ${input.amount} to terminal ${input.terminalSerial} (ref ${input.merchantReference})`,
    );

    if (!this.isLive) {
      // Stub: accept the push; the transaction sits PROCESSING until a
      // stubbed lookup later reports it succeeded.
      return {
        merchantReference: input.merchantReference,
        transactionReference: `MNP-STUB-${generateUlid()}`,
        status: PaymentIntentStatus.PROCESSING,
        message: 'Stub: pushed to terminal',
      };
    }

    try {
      const res = await this.authedFetch(`/v1/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terminalSerial: input.terminalSerial,
          amount: input.amount,
          merchantReference: input.merchantReference,
          transactionType: 'PURCHASE',
          paymentMethod: 'CARD_PURCHASE',
        }),
      });

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok) {
        this.logger.error(
          `Moniepoint push failed (${res.status}): ${JSON.stringify(data)}`,
        );
        return {
          merchantReference: input.merchantReference,
          status: PaymentIntentStatus.FAILED,
          message:
            (data['message'] as string) ??
            `Terminal push failed (${res.status})`,
          raw: data,
        };
      }

      return {
        merchantReference:
          (data['merchantReference'] as string) ?? input.merchantReference,
        transactionReference: data['transactionReference'] as string,
        // A freshly pushed transaction is PENDING/QUEUED on the device.
        status: mapProcessingStatus(data['processingStatus'] as string),
        message: data['responseMessage'] as string,
        raw: data,
      };
    } catch (err) {
      this.logger.error(
        `Moniepoint push error: ${(err as Error).message}`,
      );
      return {
        merchantReference: input.merchantReference,
        status: PaymentIntentStatus.FAILED,
        message: 'Could not reach the card terminal service',
      };
    }
  }

  /**
   * Authoritative status lookup for a pushed terminal transaction.
   * This is the single source of truth for whether the card was charged.
   */
  async lookupTerminalTransaction(
    merchantReference: string,
  ): Promise<TerminalStatusResult> {
    if (!this.isLive) {
      // Stub: report success so the full POS flow can be exercised.
      return {
        merchantReference,
        transactionReference: `MNP-STUB-${merchantReference}`,
        status: PaymentIntentStatus.SUCCEEDED,
        responseCode: '00',
        responseMessage: 'Stub: approved',
      };
    }

    try {
      const res = await this.authedFetch(
        `/v1/transactions/merchants/${encodeURIComponent(merchantReference)}`,
        { method: 'GET' },
      );
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok) {
        // 404 = not found yet (terminal still processing) — treat as pending.
        return {
          merchantReference,
          status: PaymentIntentStatus.PENDING,
          responseMessage:
            (data['message'] as string) ?? `Lookup returned ${res.status}`,
          raw: data,
        };
      }

      return {
        merchantReference:
          (data['merchantReference'] as string) ?? merchantReference,
        transactionReference: data['transactionReference'] as string,
        status: mapProcessingStatus(data['processingStatus'] as string),
        actualAmount:
          typeof data['actualAmount'] === 'number'
            ? (data['actualAmount'] as number)
            : undefined,
        responseCode: data['responseCode'] as string,
        responseMessage: data['responseMessage'] as string,
        raw: data,
      };
    } catch (err) {
      this.logger.error(
        `Moniepoint lookup error: ${(err as Error).message}`,
      );
      // Transient error — pending, so the caller retries rather than failing.
      return { merchantReference, status: PaymentIntentStatus.PENDING };
    }
  }

  // ── IPaymentProvider contract ──
  // Moniepoint here is terminal-only; the generic hosted-checkout shape
  // doesn't apply. createPayment is unsupported; verifyPayment maps onto
  // the terminal lookup so PaymentsService.verifyAndReconcile works.

  async createPayment(input: CreatePaymentInput): Promise<PaymentIntent> {
    this.logger.warn(
      'MoniepointProvider.createPayment is not supported — use pushToTerminal',
    );
    return {
      providerReference: '',
      amount: input.amount,
      currency: input.currency,
      provider: this.name,
      status: PaymentIntentStatus.FAILED,
      metadata: { error: 'Moniepoint is a POS-terminal provider' },
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<PaymentIntent> {
    const result = await this.lookupTerminalTransaction(
      input.providerReference,
    );
    return {
      providerReference:
        result.transactionReference ?? input.providerReference,
      amount: result.actualAmount ?? 0,
      currency: 'NGN',
      provider: this.name,
      status: result.status,
      metadata: {
        gatewayResponse: result.responseMessage,
        responseCode: result.responseCode,
        ...(result.raw ?? {}),
      },
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    // Moniepoint terminal reversals are handled out-of-band by the
    // merchant; we record the intent only.
    this.logger.log(
      `Moniepoint refund recorded for ${input.providerReference} (manual reversal required)`,
    );
    return {
      providerReference: input.providerReference,
      refundReference: `MNP-REF-${generateUlid()}`,
      amount: input.amount,
      status: 'PENDING',
    };
  }

  /**
   * Moniepoint does not publish a webhook payload schema or a documented
   * signing scheme. Per the agreed strategy the webhook is only a "go
   * reconcile" nudge — it never sets state — so this returns true and the
   * authoritative confirmation is always the transaction lookup.
   */
  verifyWebhookSignature(_payload: WebhookPayload): boolean {
    return true;
  }
}
