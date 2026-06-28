import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  IPaymentProvider,
  PaymentProviderName,
  CreatePaymentInput,
  PaymentIntent,
  PaymentIntentStatus,
  VerifyPaymentInput,
  RefundInput,
  RefundResult,
} from './interfaces/payment-provider.interface';
import { MoniepointProvider } from './providers/moniepoint.provider';
import { PaystackProvider } from './providers/paystack.provider';
import { StripeProvider } from './providers/stripe.provider';
import {
  Payment,
  PaymentProvider,
  PaymentChannel,
  PaymentMethodType,
  PaymentStatus,
} from './entities/payment.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { AgentsService } from '../agents/agents.service';
import { ShippingDispatchService } from '../shipping/shipping-dispatch.service';
import { PosGateway } from '../realtime/pos.gateway';

/** Input to record/begin a payment row. */
export interface RecordPaymentInput {
  orderId: string;
  orderNumber: string;
  provider: PaymentProvider;
  channel: PaymentChannel;
  method: PaymentMethodType;
  amount: number;
  currency: string;
  merchantReference: string;
  providerReference?: string | null;
  terminalSerial?: string | null;
  checkoutUrl?: string | null;
  status?: PaymentStatus;
  createdBy?: string | null;
  paidAt?: Date | null;
}

/**
 * PaymentsService — owns the `payments` table and provider routing.
 *
 * State rule: a payment row only becomes SUCCEEDED via an authoritative
 * confirmation — a provider verify call or a transaction lookup. Webhook
 * bodies are stored for audit but never trusted to set state directly.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly providers: Map<PaymentProviderName, IPaymentProvider>;

  constructor(
    private readonly moniepoint: MoniepointProvider,
    private readonly paystack: PaystackProvider,
    private readonly stripe: StripeProvider,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly dataSource: DataSource,
    // Optional + forwardRef avoids the PaymentsModule ↔ AgentsModule
    // circular import. When the agents module isn't wired (e.g. in a
    // narrow test), payments still flow normally — only the post-PAID
    // attribution hook is skipped.
    @Optional()
    @Inject(forwardRef(() => AgentsService))
    private readonly agentsService?: AgentsService,
    @Optional()
    private readonly shippingDispatchService?: ShippingDispatchService,
    // Optional so payments still work if realtime isn't wired; the dispatch
    // alert is best-effort and must never block or fail the payment path.
    @Optional()
    private readonly posGateway?: PosGateway,
  ) {
    this.providers = new Map<PaymentProviderName, IPaymentProvider>([
      [PaymentProviderName.MONIEPOINT, moniepoint],
      [PaymentProviderName.PAYSTACK, paystack],
      [PaymentProviderName.STRIPE, stripe],
    ]);
  }

  // ── Provider routing (used by Paystack / Moniepoint flows) ──

  resolveProvider(currency: string, preferred?: PaymentProviderName): IPaymentProvider {
    if (preferred) {
      const provider = this.providers.get(preferred);
      if (!provider) throw new BadRequestException(`Unknown provider: ${preferred}`);
      return provider;
    }
    if (currency === 'NGN') return this.paystack;
    return this.stripe;
  }

  async createProviderPayment(
    input: CreatePaymentInput,
    preferred?: PaymentProviderName,
  ): Promise<PaymentIntent> {
    const provider = this.resolveProvider(input.currency, preferred);
    return provider.createPayment(input);
  }

  async verifyProviderPayment(input: VerifyPaymentInput): Promise<PaymentIntent> {
    const provider = this.providers.get(input.provider);
    if (!provider) throw new BadRequestException(`Unknown provider: ${input.provider}`);
    return provider.verifyPayment(input);
  }

  async refundProviderPayment(
    providerName: PaymentProviderName,
    input: RefundInput,
  ): Promise<RefundResult> {
    const provider = this.providers.get(providerName);
    if (!provider) throw new BadRequestException(`Unknown provider: ${providerName}`);
    return provider.refund(input);
  }

  // ── Payment record persistence ──

  /**
   * Create a payment row. Idempotent on merchantReference: if a row with
   * that reference already exists it is returned unchanged, so a retried
   * initiate call never duplicates a payment.
   */
  async record(input: RecordPaymentInput): Promise<Payment> {
    const existing = await this.paymentRepo.findOne({
      where: { merchantReference: input.merchantReference },
    });
    if (existing) return existing;

    const payment = this.paymentRepo.create({
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      provider: input.provider,
      channel: input.channel,
      method: input.method,
      amount: input.amount,
      currency: input.currency,
      merchantReference: input.merchantReference,
      providerReference: input.providerReference ?? null,
      terminalSerial: input.terminalSerial ?? null,
      checkoutUrl: input.checkoutUrl ?? null,
      status: input.status ?? PaymentStatus.PENDING,
      createdBy: input.createdBy ?? null,
      paidAt: input.paidAt ?? null,
    });
    return this.paymentRepo.save(payment);
  }

  async findById(id: string): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({ where: { id } });
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    return payment;
  }

  async findByMerchantReference(ref: string): Promise<Payment | null> {
    return this.paymentRepo.findOne({ where: { merchantReference: ref } });
  }

  /** All payment rows for an order, oldest first. */
  async findByOrder(orderId: string): Promise<Payment[]> {
    return this.paymentRepo.find({
      where: { orderId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Apply an authoritative provider state to a payment row.
   *
   * This is the ONLY path that flips a payment to SUCCEEDED/FAILED, and it
   * runs in a transaction with the order-paid recomputation. Idempotent:
   * re-applying the same terminal state is a no-op, so a webhook + a
   * verify call landing on the same result converge safely.
   */
  async applyProviderState(
    paymentId: string,
    next: {
      status: PaymentStatus;
      providerReference?: string | null;
      gatewayResponse?: string | null;
      failureReason?: string | null;
      rawProviderData?: Record<string, unknown> | null;
    },
  ): Promise<Payment> {
    let orderJustPaidId: string | null = null;
    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Payment);
      const payment = await repo.findOne({ where: { id: paymentId } });
      if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);

      // Terminal states are immutable — never downgrade a SUCCEEDED row.
      const terminal = [
        PaymentStatus.SUCCEEDED,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELLED,
        PaymentStatus.REFUNDED,
      ];
      if (terminal.includes(payment.status) && payment.status !== next.status) {
        this.logger.warn(
          `Payment ${paymentId} is already ${payment.status}; ignoring transition to ${next.status}`,
        );
        return payment;
      }

      payment.status = next.status;
      if (next.providerReference !== undefined)
        payment.providerReference = next.providerReference;
      if (next.gatewayResponse !== undefined)
        payment.gatewayResponse = next.gatewayResponse;
      if (next.failureReason !== undefined)
        payment.failureReason = next.failureReason;
      if (next.rawProviderData !== undefined)
        payment.rawProviderData = next.rawProviderData;
      if (next.status === PaymentStatus.SUCCEEDED && !payment.paidAt) {
        payment.paidAt = new Date();
      }
      const out = await repo.save(payment);

      // Recompute whether the order is now fully paid. recomputeOrderPaid
      // returns true on the exact transition into PAID so we can fire
      // post-commit side-effects (agent attribution) at most once.
      if (next.status === PaymentStatus.SUCCEEDED) {
        const transitioned = await this.recomputeOrderPaid(
          manager,
          payment.orderId,
        );
        if (transitioned) orderJustPaidId = payment.orderId;
      }
      return out;
    });

    // Post-commit side-effect: credit the marketing agent if this order
    // carried an agentCode. The hook is idempotent (unique on orderId)
    // so it's safe even if a retry runs the same applyProviderState call.
    if (orderJustPaidId) {
      await this.fireOrderPaidHooks(orderJustPaidId);
    }
    return saved;
  }

  /** Store a raw webhook body against a payment for audit. Never sets state. */
  async attachWebhook(
    paymentId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) return;
    payment.rawWebhook = body;
    await this.paymentRepo.save(payment);
  }

  /**
   * Flip the order to PAID once the sum of its SUCCEEDED payments covers
   * the grand total. Runs inside the caller's transaction.
   */
  private async recomputeOrderPaid(
    manager: import('typeorm').EntityManager,
    orderId: string,
  ): Promise<boolean> {
    const orderRepo = manager.getRepository(Order);
    const order = await orderRepo.findOne({ where: { id: orderId } });
    if (!order) return false;

    const row = await manager
      .getRepository(Payment)
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'paid')
      .where('p.orderId = :orderId', { orderId })
      .andWhere('p.status = :s', { s: PaymentStatus.SUCCEEDED })
      .getRawOne<{ paid: string }>();
    const paid = Number(row?.paid ?? 0);

    if (paid >= Number(order.grandTotal)) {
      // Only advance an order that is still awaiting payment — never
      // override PROCESSING/SHIPPED/etc.
      if (
        order.status === OrderStatus.DRAFT ||
        order.status === OrderStatus.PENDING_PAYMENT
      ) {
        order.status = OrderStatus.PAID;
        order.paidAt = new Date();
        await orderRepo.save(order);
        return true;
      }
    }
    return false;
  }

  /**
   * Side-effects to run AFTER the recomputeOrderPaid transaction commits
   * — currently just marketing-agent attribution. Failure must NOT bubble
   * back into the payment flow; the order is already PAID and the customer
   * has been charged. Errors are logged for super-admin follow-up.
   */
  private async fireOrderPaidHooks(orderId: string): Promise<void> {
    if (this.agentsService) {
      try {
        await this.agentsService.applyAttributionOnPaid(orderId);
      } catch (err) {
        this.logger.error(
          `Agent attribution failed for order ${orderId}: ${
            (err as Error).message
          }`,
        );
      }
    }
    // AAJ shipping: kick off the booking flow. Fire-and-forget — the
    // retry worker re-tries every minute if the live call fails so we
    // never block the payment path on AAJ availability.
    if (this.shippingDispatchService) {
      void this.shippingDispatchService
        .bookAndProcess(orderId)
        .catch((err) =>
          this.logger.error(
            `Shipping dispatch threw for ${orderId}: ${
              (err as Error).message
            }`,
          ),
        );
    }

    // Dispatch alert: notify POS terminals about a new paid order that needs
    // branch sorting + courier pickup. Best-effort and fully isolated — any
    // failure here is logged and swallowed so it can never affect payment.
    if (this.posGateway) {
      try {
        const order = await this.orderRepo.findOne({
          where: { id: orderId },
          relations: ['items'],
        });
        if (!order) {
          this.logger.warn(`Dispatch alert: order ${orderId} not found`);
          return;
        }
        // An order needs branch dispatch when it ships from a branch:
        // storefront/mobile channel, not opted out of shipping. We prefer the
        // explicit dispatchStatus flag (set at checkout) but fall back to the
        // shipping fields so orders created before that column existed — or by
        // any path that didn't set it — still raise the alert. Also backfill
        // the flag so the POS dispatch queue lists the order.
        const isStaffChannel = order.channel === 'POS' || order.channel === 'ADMIN';
        const needsDispatch =
          order.dispatchStatus === 'PENDING' ||
          (!order.dispatchStatus && !order.shippingOptOut && !isStaffChannel);

        if (!needsDispatch || order.dispatchStatus === 'DISPATCHED') {
          this.logger.debug(
            `Dispatch alert skipped for ${order.orderNumber} ` +
              `(dispatchStatus=${order.dispatchStatus ?? 'null'}, ` +
              `optOut=${order.shippingOptOut}, channel=${order.channel})`,
          );
          return;
        }

        // Backfill PENDING so the dispatch queue + admin reflect it.
        if (order.dispatchStatus !== 'PENDING') {
          order.dispatchStatus = 'PENDING';
          await this.orderRepo.update(order.id, { dispatchStatus: 'PENDING' });
        }

        const addr = order.shippingAddress;
        this.posGateway.emitDispatchNew({
          orderId: order.id,
          orderNumber: order.orderNumber,
          channel: order.channel,
          currency: order.currency,
          grandTotal: Number(order.grandTotal),
          itemCount: (order.items ?? []).reduce(
            (s, i) => s + (i.quantity ?? 0),
            0,
          ),
          customerName: addr
            ? `${addr.firstName} ${addr.lastName}`.trim()
            : (order.guestEmail ?? 'Customer'),
          city: addr?.city,
          state: addr?.state,
          createdAt: (order.createdAt ?? new Date()).toISOString(),
        });
        this.logger.log(
          `Dispatch alert emitted for ${order.orderNumber} → dispatch room`,
        );
      } catch (err) {
        this.logger.warn(
          `Dispatch alert emit failed for ${orderId} (non-fatal): ${
            (err as Error).message
          }`,
        );
      }
    } else {
      this.logger.warn(
        `Dispatch alert: PosGateway not injected — no alert for ${orderId}`,
      );
    }
  }

  /**
   * Paginated payments list for the admin Payments page.
   */
  async list(opts: {
    page?: number;
    limit?: number;
    status?: PaymentStatus;
    channel?: PaymentChannel;
    provider?: PaymentProvider;
    search?: string;
  } = {}): Promise<{
    items: Payment[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const page = Math.max(1, Math.floor(opts.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.floor(opts.limit ?? 20)));

    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .orderBy('p.createdAt', 'DESC');

    if (opts.status) qb.andWhere('p.status = :status', { status: opts.status });
    if (opts.channel) qb.andWhere('p.channel = :channel', { channel: opts.channel });
    if (opts.provider) qb.andWhere('p.provider = :provider', { provider: opts.provider });
    if (opts.search && opts.search.trim()) {
      const term = `%${opts.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(p.orderNumber) LIKE :term OR LOWER(p.merchantReference) LIKE :term OR LOWER(p.providerReference) LIKE :term)',
        { term },
      );
    }

    qb.skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
  }

  // ── Paystack orchestration (storefront + mobile) ──

  /**
   * Begin a Paystack payment for an order.
   *
   * Server-mediated: the client never calls Paystack. We create the
   * PENDING payment row, ask Paystack to initialize a transaction using
   * our merchantReference as the Paystack `reference`, and hand the
   * client only the hosted-checkout URL.
   *
   * Idempotent per order: if an in-progress (PENDING/PROCESSING) Paystack
   * payment already exists for the order, it is returned as-is rather
   * than creating a second transaction.
   */
  async initiatePaystackPayment(input: {
    order: Order;
    channel: PaymentChannel;
    customerEmail: string;
    customerName: string;
    callbackUrl: string;
  }): Promise<Payment> {
    const { order } = input;

    // Reuse an existing open attempt for this order if there is one.
    const open = await this.paymentRepo.findOne({
      where: [
        { orderId: order.id, provider: PaymentProvider.PAYSTACK, status: PaymentStatus.PENDING },
        { orderId: order.id, provider: PaymentProvider.PAYSTACK, status: PaymentStatus.PROCESSING },
      ],
      order: { createdAt: 'DESC' },
    });
    if (open && open.checkoutUrl) return open;

    const merchantReference = `MN-${order.orderNumber}-${Date.now()}`;
    const amount = Number(order.grandTotal);

    // Create the PENDING row first, so even if the provider call fails we
    // have a record of the attempt.
    const payment = await this.record({
      orderId: order.id,
      orderNumber: order.orderNumber,
      provider: PaymentProvider.PAYSTACK,
      channel: input.channel,
      method: PaymentMethodType.CARD,
      amount,
      currency: order.currency,
      merchantReference,
      status: PaymentStatus.PENDING,
    });

    const intent = await this.paystack.createPayment({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount,
      currency: order.currency,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      callbackUrl: input.callbackUrl,
      // The provider uses this as the Paystack `reference`.
      metadata: { merchantReference },
    });

    if (intent.status === PaymentIntentStatus.FAILED || !intent.checkoutUrl) {
      await this.applyProviderState(payment.id, {
        status: PaymentStatus.FAILED,
        failureReason:
          (intent.metadata?.['error'] as string) ?? 'Failed to initialize payment',
        rawProviderData: intent.metadata ?? null,
      });
      throw new BadRequestException('Could not initialize payment. Please try again.');
    }

    // Persist the provider reference + checkout URL onto the row.
    payment.providerReference = intent.providerReference;
    payment.checkoutUrl = intent.checkoutUrl;
    payment.status = PaymentStatus.PROCESSING;
    return this.paymentRepo.save(payment);
  }

  /**
   * Authoritatively reconcile a payment with the provider.
   *
   * This calls the provider's verify API (server-side, never the client)
   * and applies the result through applyProviderState — the single path
   * that can mark a payment SUCCEEDED/FAILED and flip the order to PAID.
   * Safe to call repeatedly (webhook + client poll + manual): terminal
   * states are immutable, so all callers converge on the same result.
   */
  async verifyAndReconcile(merchantReference: string): Promise<Payment> {
    const payment = await this.findByMerchantReference(merchantReference);
    if (!payment) {
      throw new NotFoundException(`No payment for reference ${merchantReference}`);
    }

    // Already settled — nothing to do.
    if (
      payment.status === PaymentStatus.SUCCEEDED ||
      payment.status === PaymentStatus.REFUNDED
    ) {
      return payment;
    }

    const providerName =
      payment.provider === PaymentProvider.PAYSTACK
        ? PaymentProviderName.PAYSTACK
        : payment.provider === PaymentProvider.MONIEPOINT
          ? PaymentProviderName.MONIEPOINT
          : null;
    if (!providerName) {
      // CASH payments have no provider to verify against.
      return payment;
    }

    const provider = this.providers.get(providerName);
    if (!provider) return payment;

    // Both providers look up by the reference we gave them at creation
    // time, which is our merchantReference. Paystack uses it as the
    // transaction `reference`; Moniepoint's terminal-status endpoint is
    // GET /v1/transactions/merchants/{merchantReference}.
    const verifyRef = payment.merchantReference;

    let intent: PaymentIntent;
    try {
      intent = await provider.verifyPayment({
        providerReference: verifyRef,
        provider: providerName,
      });
    } catch (err) {
      this.logger.error(
        `Verify failed for ${merchantReference}: ${(err as Error).message}`,
      );
      // Leave the row untouched — a transient verify error must not mark
      // a payment failed. The next reconcile attempt will retry.
      return payment;
    }

    const nextStatus = PaymentsService.mapIntentStatus(intent.status);
    return this.applyProviderState(payment.id, {
      status: nextStatus,
      providerReference: intent.providerReference || payment.providerReference,
      gatewayResponse: (intent.metadata?.['gatewayResponse'] as string) ?? null,
      failureReason:
        nextStatus === PaymentStatus.FAILED
          ? ((intent.metadata?.['gatewayResponse'] as string) ?? 'Payment failed')
          : null,
      rawProviderData: intent.metadata ?? null,
    });
  }

  // ── POS payments (cash + Moniepoint terminal) ──

  /**
   * Record a cash payment taken at the POS. A confirmed cash payment is
   * money already in hand, so it is recorded directly as SUCCEEDED. Used
   * for both single cash sales and the cash leg of a split payment.
   */
  async recordCashPayment(input: {
    order: Order;
    amount: number;
    createdBy?: string | null;
  }): Promise<Payment> {
    const merchantReference = `CASH-${input.order.orderNumber}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const payment = await this.record({
      orderId: input.order.id,
      orderNumber: input.order.orderNumber,
      provider: PaymentProvider.CASH,
      channel: PaymentChannel.POS,
      method: PaymentMethodType.CASH,
      amount: input.amount,
      currency: input.order.currency,
      merchantReference,
      status: PaymentStatus.SUCCEEDED,
      createdBy: input.createdBy ?? null,
      paidAt: new Date(),
    });
    // Recompute order paid-state (cash row is already SUCCEEDED).
    await this.applyProviderState(payment.id, {
      status: PaymentStatus.SUCCEEDED,
      gatewayResponse: 'Cash collected at POS',
    });
    return this.findById(payment.id);
  }

  /**
   * Push a card payment to a physical Moniepoint terminal.
   *
   * Creates a PROCESSING payment row and pushes the transaction to the
   * device. The customer then taps/inserts their card on the terminal.
   * Confirmation is NOT here — the caller polls verifyAndReconcile (or the
   * Moniepoint webhook nudges it) until the row settles SUCCEEDED/FAILED.
   */
  async pushTerminalPayment(input: {
    order: Order;
    amount: number;
    terminalSerial: string;
    createdBy?: string | null;
  }): Promise<Payment> {
    const merchantReference = `POS-${input.order.orderNumber}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const payment = await this.record({
      orderId: input.order.id,
      orderNumber: input.order.orderNumber,
      provider: PaymentProvider.MONIEPOINT,
      channel: PaymentChannel.POS,
      method: PaymentMethodType.CARD,
      amount: input.amount,
      currency: input.order.currency,
      merchantReference,
      terminalSerial: input.terminalSerial,
      status: PaymentStatus.PENDING,
      createdBy: input.createdBy ?? null,
    });

    const pushResult = await this.moniepoint.pushToTerminal({
      terminalSerial: input.terminalSerial,
      amount: input.amount,
      merchantReference,
    });

    if (pushResult.status === PaymentIntentStatus.FAILED) {
      await this.applyProviderState(payment.id, {
        status: PaymentStatus.FAILED,
        failureReason: pushResult.message ?? 'Terminal push failed',
        rawProviderData: pushResult.raw ?? null,
      });
      throw new BadRequestException(
        pushResult.message ?? 'Could not start the card payment on the terminal.',
      );
    }

    // Pushed successfully — the card transaction is now PROCESSING on the
    // device. Store the provider reference; do NOT mark succeeded.
    payment.providerReference = pushResult.transactionReference ?? null;
    payment.status = PaymentStatus.PROCESSING;
    payment.rawProviderData = pushResult.raw ?? null;
    return this.paymentRepo.save(payment);
  }

  /** Map a provider PaymentIntentStatus onto our PaymentStatus. */
  static mapIntentStatus(s: PaymentIntentStatus): PaymentStatus {
    switch (s) {
      case PaymentIntentStatus.SUCCEEDED:
        return PaymentStatus.SUCCEEDED;
      case PaymentIntentStatus.FAILED:
        return PaymentStatus.FAILED;
      case PaymentIntentStatus.CANCELLED:
        return PaymentStatus.CANCELLED;
      case PaymentIntentStatus.PROCESSING:
      case PaymentIntentStatus.REQUIRES_ACTION:
        return PaymentStatus.PROCESSING;
      case PaymentIntentStatus.PENDING:
      default:
        return PaymentStatus.PENDING;
    }
  }
}
