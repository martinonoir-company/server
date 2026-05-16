import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
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
    return this.dataSource.transaction(async (manager) => {
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
      const saved = await repo.save(payment);

      // Recompute whether the order is now fully paid.
      if (next.status === PaymentStatus.SUCCEEDED) {
        await this.recomputeOrderPaid(manager, payment.orderId);
      }
      return saved;
    });
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
  ): Promise<void> {
    const orderRepo = manager.getRepository(Order);
    const order = await orderRepo.findOne({ where: { id: orderId } });
    if (!order) return;

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
      }
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
