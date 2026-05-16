import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InventoryService } from '../inventory/inventory.service';
import { MovementKind } from '../inventory/entities/inventory.entity';
import { Order, OrderItem, OrderStatusHistory, OrderStatus, OrderChannel, PaymentMethod } from '../orders/entities/order.entity';
import { ProductVariant, Product } from '../products/entities/product.entity';
import {
  PosTransactionDto,
  PosSyncBatchDto,
  PosSyncBatchResult,
} from './dto/pos-sync.dto';
import { PosSyncJob, SyncJobStatus } from './entities/pos-sync-job.entity';
import { PaymentsService } from '../payments/payments.service';
import {
  PaymentProvider,
  PaymentChannel,
  PaymentMethodType,
  PaymentStatus,
} from '../payments/entities/payment.entity';

/** Map a POS payment-split method onto the payments-ledger taxonomy. */
const SPLIT_TO_PAYMENT: Record<
  string,
  { provider: PaymentProvider; method: PaymentMethodType }
> = {
  CASH: { provider: PaymentProvider.CASH, method: PaymentMethodType.CASH },
  POS_TERMINAL: {
    provider: PaymentProvider.MONIEPOINT,
    method: PaymentMethodType.CARD,
  },
  BANK_TRANSFER: {
    provider: PaymentProvider.CASH,
    method: PaymentMethodType.BANK_TRANSFER,
  },
};

/** Map POS payment method strings to the PaymentMethod enum */
const PAYMENT_METHOD_MAP: Record<string, PaymentMethod> = {
  CASH: PaymentMethod.CASH,
  POS_TERMINAL: PaymentMethod.POS_TERMINAL,
  BANK_TRANSFER: PaymentMethod.BANK_TRANSFER,
};

@Injectable()
export class PosSyncService {
  private readonly logger = new Logger(PosSyncService.name);
  private orderCounter = 0;

  constructor(
    private readonly inventoryService: InventoryService,
    private readonly dataSource: DataSource,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(ProductVariant) private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(PosSyncJob) private readonly syncJobRepo: Repository<PosSyncJob>,
    private readonly paymentsService: PaymentsService,
  ) {}

  /**
   * Process a batch of POS transactions sequentially.
   *
   * Rules:
   * - Each transaction is processed independently (partial failure OK)
   * - Duplicate transactionIds are silently skipped (idempotent)
   * - Insufficient stock → reported in `failed[]`, batch continues
   * - Stock deductions are immediate (no reservation for POS)
   * - Split payments supported via `payments[]` array
   */
  async processBatch(batch: PosSyncBatchDto): Promise<PosSyncBatchResult> {
    const result: PosSyncBatchResult = {
      terminalId: batch.terminalId,
      processedAt: new Date().toISOString(),
      successful: [],
      failed: [],
      skipped: [],
      summary: { total: batch.transactions.length, successCount: 0, failedCount: 0, skippedCount: 0 },
    };

    for (const tx of batch.transactions) {
      try {
        const txResult = await this.processTransaction(tx);

        if (txResult.status === 'SKIPPED') {
          result.skipped.push({ transactionId: tx.transactionId, reason: txResult.reason! });
          result.summary.skippedCount++;
        } else if (txResult.status === 'SUCCESS') {
          result.successful.push({
            transactionId: tx.transactionId,
            orderId: txResult.orderId!,
            orderNumber: txResult.orderNumber!,
          });
          result.summary.successCount++;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`POS sync failed for tx=${tx.transactionId}: ${reason}`);
        result.failed.push({ transactionId: tx.transactionId, reason });
        result.summary.failedCount++;

        // Persist failed job for background retry
        await this.persistFailedJob(tx, batch.terminalId, reason);
      }
    }

    return result;
  }

  /**
   * Process a single POS transaction.
   */
  async processTransaction(
    tx: PosTransactionDto,
  ): Promise<{ status: 'SUCCESS' | 'SKIPPED'; orderId?: string; orderNumber?: string; reason?: string }> {
    // 1. Idempotency: check if this transactionId already created an order
    const existingOrder = await this.orderRepo.findOne({
      where: { idempotencyKey: `pos-${tx.transactionId}` },
    });
    if (existingOrder) {
      return {
        status: 'SKIPPED',
        orderId: existingOrder.id,
        orderNumber: existingOrder.orderNumber,
        reason: 'Transaction already processed',
      };
    }

    // 2. Validate all variants and deduct stock atomically per-item
    const orderItems: Partial<OrderItem>[] = [];
    let subtotal = 0;
    const currency = tx.currency ?? 'NGN';

    for (const item of tx.items) {
      const variant = await this.variantRepo.findOne({
        where: { id: item.variantId, isActive: true },
      });
      if (!variant) {
        throw new Error(`Variant ${item.variantId} not found or inactive`);
      }

      const product = await this.productRepo.findOne({
        where: { id: variant.productId },
      });
      if (!product || !product.isActive) {
        throw new Error(`Product for variant ${item.variantId} is unavailable`);
      }

      // Deduct stock immediately (POS = no reservation)
      if (variant.trackInventory) {
        await this.inventoryService.recordMovement({
          variantId: variant.id,
          kind: MovementKind.SALE,
          quantity: item.quantity,
          referenceId: tx.transactionId,
          referenceType: 'POS_SALE',
          reason: `POS sale from terminal ${tx.terminalId}`,
          createdBy: tx.staffId,
        });
      }

      // Use the wholesale price from DB (don't trust client-sent unitPrice)
      const unitPrice = currency === 'USD'
        ? Number(variant.wholesalePriceUsd)
        : Number(variant.wholesalePriceNgn);
      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;

      orderItems.push({
        variantId: variant.id,
        productName: product.name,
        variantName: variant.name,
        sku: variant.sku,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
        options: variant.options,
      });
    }

    // 3. Calculate discount
    const discountTotal = tx.discountAmount ?? 0;
    const grandTotal = Math.max(0, subtotal - discountTotal);

    // 4. Determine primary payment method (largest amount in split)
    const primaryPayment = tx.payments.reduce(
      (max, p) => (p.amount > max.amount ? p : max),
      tx.payments[0],
    );
    const paymentMethod = PAYMENT_METHOD_MAP[primaryPayment.method] ?? PaymentMethod.CASH;

    // 5. Build payment details for staff note
    const paymentDetails = tx.payments
      .map((p) => `${p.method}: ${currency} ${p.amount.toLocaleString()}`)
      .join(' + ');

    // A POS_TERMINAL (card) leg is confirmed by the physical Moniepoint
    // device, NOT here. When the tender contains a card leg the order is
    // created PENDING_PAYMENT and the card leg's payment row is owned by
    // the /payments/pos/terminal flow — that flow flips the order to PAID
    // once the device confirms. A cash-only sale is PAID immediately.
    const hasCardLeg = tx.payments.some((p) => p.method === 'POS_TERMINAL');
    const initialStatus = hasCardLeg
      ? OrderStatus.PENDING_PAYMENT
      : OrderStatus.PAID;

    // 6. Create the order
    const orderNumber = this.generateOrderNumber();

    const saved = await this.dataSource.transaction(async (manager) => {
      const order = manager.create(Order, {
        orderNumber,
        status: initialStatus,
        channel: OrderChannel.POS,
        currency,
        subtotal,
        discountTotal,
        shippingTotal: 0,
        taxTotal: 0,
        grandTotal,
        paymentMethod,
        paidAt: hasCardLeg ? undefined : new Date(tx.timestamp),
        idempotencyKey: `pos-${tx.transactionId}`,
        couponCode: tx.couponCode,
        discountType: tx.discountType || (tx.couponCode ? 'COUPON' : tx.discountAmount ? 'MANUAL' : undefined),
        discountAppliedBy: (tx.discountAmount || tx.couponCode) ? tx.staffId : undefined,
        discountAppliedByName: (tx.discountAmount || tx.couponCode) ? tx.staffName : undefined,
        discountAppliedAt: (tx.discountAmount || tx.couponCode) ? (tx.discountAppliedAt ? new Date(tx.discountAppliedAt) : new Date(tx.timestamp)) : undefined,
        staffNote: `POS terminal: ${tx.terminalId} | Payment: ${paymentDetails}`,
        customerNote: tx.customerName
          ? `Customer: ${tx.customerName}${tx.customerPhone ? ` (${tx.customerPhone})` : ''}`
          : undefined,
        items: orderItems.map((item) => manager.create(OrderItem, item)),
        statusHistory: [
          manager.create(OrderStatusHistory, {
            fromStatus: OrderStatus.DRAFT,
            toStatus: initialStatus,
            changedBy: tx.staffId,
            reason: hasCardLeg
              ? 'POS sale — awaiting card payment on terminal'
              : 'POS sale — immediate payment',
          }),
        ],
      });

      return manager.save(Order, order);
    });

    // 7. Record a payment row per NON-CARD split into the payments ledger.
    //    Cash / bank-transfer legs are money already collected by the
    //    cashier, so they are recorded SUCCEEDED. A POS_TERMINAL (card)
    //    leg is intentionally skipped here — its payment row is created
    //    and confirmed by the /payments/pos/terminal flow once the
    //    physical Moniepoint device approves the card.
    //    POS split amounts are MINOR units (kobo), consistent with the
    //    order rows. Ledger writes are best-effort — the order is the
    //    source of truth and must survive a payment-row hiccup.
    for (const split of tx.payments) {
      if (split.method === 'POS_TERMINAL') continue;
      const mapping =
        SPLIT_TO_PAYMENT[split.method] ?? SPLIT_TO_PAYMENT['CASH']!;
      try {
        await this.paymentsService.record({
          orderId: saved.id,
          orderNumber: saved.orderNumber,
          provider: mapping.provider,
          channel: PaymentChannel.POS,
          method: mapping.method,
          amount: Math.round(split.amount),
          currency,
          merchantReference: `POS-${tx.transactionId}-${split.method}`,
          status: PaymentStatus.SUCCEEDED,
          createdBy: tx.staffId,
          paidAt: new Date(tx.timestamp),
        });
      } catch (err) {
        this.logger.error(
          `Failed to record ${split.method} payment for order ${saved.orderNumber}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    return {
      status: 'SUCCESS' as const,
      orderId: saved.id,
      orderNumber: saved.orderNumber,
    };
  }

  /**
   * Persist a failed transaction as a sync job for background retry.
   */
  private async persistFailedJob(
    tx: PosTransactionDto,
    terminalId: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      const existing = await this.syncJobRepo.findOne({
        where: { transactionId: tx.transactionId },
      });
      if (existing) {
        existing.retryCount++;
        existing.errorMessage = errorMessage;
        existing.status = existing.retryCount >= 3 ? SyncJobStatus.DEAD_LETTER : SyncJobStatus.FAILED;
        await this.syncJobRepo.save(existing);
        return;
      }

      const job = this.syncJobRepo.create({
        transactionId: tx.transactionId,
        terminalId,
        transactionPayload: tx,
        status: SyncJobStatus.FAILED,
        errorMessage,
      });
      await this.syncJobRepo.save(job);
    } catch (err) {
      this.logger.error(`Failed to persist sync job for tx=${tx.transactionId}: ${err}`);
    }
  }

  /**
   * Get pending/failed sync jobs for retry.
   */
  async getRetryableJobs(maxRetries = 3): Promise<PosSyncJob[]> {
    return this.syncJobRepo
      .createQueryBuilder('job')
      .where('job.status = :status', { status: SyncJobStatus.FAILED })
      .andWhere('job.retryCount < :max', { max: maxRetries })
      .orderBy('job.createdAt', 'ASC')
      .take(20)
      .getMany();
  }

  /**
   * Mark a sync job as completed.
   */
  async completeJob(jobId: string, orderId: string): Promise<void> {
    await this.syncJobRepo.update(jobId, {
      status: SyncJobStatus.COMPLETED,
      orderId,
    });
  }

  private generateOrderNumber(): string {
    const now = new Date();
    const y = now.getFullYear().toString().slice(-2);
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    this.orderCounter++;
    const seq = this.orderCounter.toString().padStart(5, '0');
    return `POS-${y}${m}${d}-${seq}`;
  }
}
