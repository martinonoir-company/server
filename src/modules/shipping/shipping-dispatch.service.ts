import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Order } from '../orders/entities/order.entity';
import { Branch } from '../branches/entities/branch.entity';
import { User } from '../users/entities/user.entity';
import {
  AajProvider,
  AajAddress,
  AajPackageItem,
  AajTrackingResult,
} from './aaj.provider';

/**
 * Orchestrates AAJ Express bookings for paid orders.
 *
 * Triggered by PaymentsService's order-PAID hook (when the order is not
 * opted out of shipping). Implements create-booking → process-booking,
 * stamping the order with AAJ tracking data. Failures don't roll back
 * the order — money is already collected — they queue for a retry
 * worker that runs every minute.
 *
 * Tracking is exposed via getTracking() which proxies AAJ's
 * track-shipment endpoint with a 60-second cache on the order row.
 */
@Injectable()
export class ShippingDispatchService {
  private readonly logger = new Logger(ShippingDispatchService.name);

  /** Cache TTL for tracking lookups (ms). */
  private static readonly TRACKING_CACHE_TTL_MS = 60_000;
  /** Maximum retries before we alert the admin. */
  private static readonly MAX_RETRIES = 8;

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly aaj: AajProvider,
  ) {}

  /**
   * Fired by PaymentsService after a successful PAID transition.
   *
   * Idempotent: returns early when the order has shippingOptOut=true
   * or already has a shippingTrackingId. We never duplicate a booking.
   * AAJ's create-booking is also idempotent on `customBookingId` (the
   * order number), so even a fully re-entrant retry won't book twice.
   */
  async bookAndProcess(orderId: string): Promise<void> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) return;
    if (order.shippingOptOut) {
      this.logger.debug(
        `Order ${order.orderNumber} opted out of shipping — skipping AAJ.`,
      );
      return;
    }
    if (order.shippingTrackingId) {
      this.logger.debug(
        `Order ${order.orderNumber} already has tracking ${order.shippingTrackingId}.`,
      );
      return;
    }

    // Resolve sender (the branch we ship from).
    const sender = await this.resolveSender(order);
    if (!sender) {
      await this.markFailure(order, 'No fulfilment branch configured.');
      return;
    }

    // Resolve receiver (the customer's shipping address).
    const receiver = await this.resolveReceiver(order);
    if (!receiver) {
      await this.markFailure(
        order,
        'Order is missing a shipping address.',
      );
      return;
    }

    // 1. Create the booking. If we already have a bookingId from a
    // previous failed retry we skip the create and jump to process.
    let bookingId = order.shippingBookingId;
    if (!bookingId) {
      const items = await this.resolveItems(order);
      const weightKg = await this.resolveWeight(order);
      const created = await this.aaj.createBooking({
        customBookingId: order.orderNumber,
        sender,
        receiver,
        itemsValueNgn: Math.max(0, Math.round(Number(order.subtotal) / 100)),
        weightKg,
        items,
        description: `Martinonoir order ${order.orderNumber}`,
      });
      if (!created.ok) {
        await this.markFailure(order, `Create-booking: ${created.error}`);
        return;
      }
      bookingId = created.data.bookingId;
      await this.orderRepo.update(order.id, {
        shippingBookingId: bookingId,
        carrier: 'AAJ Express',
      });
    }

    // 2. Process the booking — this is when AAJ actually creates the
    // shipment and issues a tracking id.
    const processed = await this.aaj.processBooking(bookingId);
    if (!processed.ok) {
      await this.markFailure(order, `Process-booking: ${processed.error}`);
      return;
    }

    // Success — clear retry markers, stamp tracking metadata.
    await this.orderRepo
      .createQueryBuilder()
      .update(Order)
      .set({
        shippingTrackingId: processed.data.trackingId,
        shippingLabelUrl: processed.data.labelUrl,
        shippingStatus: 0, // LABEL_CREATED
        shippingRetryCount: 0,
        shippingLastError: null as unknown as string,
        trackingNumber: processed.data.trackingId,
      })
      .where('id = :id', { id: order.id })
      .execute();
    this.logger.log(
      `Order ${order.orderNumber} shipped via AAJ ${processed.data.trackingId}.`,
    );
  }

  /**
   * Background retry: every minute, find paid orders that have a
   * booking ID but no tracking ID (or no booking at all but should
   * have one). Reuses bookAndProcess.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async retryPending(): Promise<void> {
    const stuck = await this.orderRepo
      .createQueryBuilder('o')
      .where('o."shippingOptOut" = false')
      .andWhere('o.status IN (:...statuses)', {
        statuses: ['PAID', 'PROCESSING'],
      })
      .andWhere('o."shippingTrackingId" IS NULL')
      .andWhere('o."shippingRetryCount" < :maxRetries', {
        maxRetries: ShippingDispatchService.MAX_RETRIES,
      })
      // Throttle: orders that JUST failed don't immediately retry —
      // back off by retry count (1m, 2m, 4m, 8m, ...).
      .andWhere(
        `(o."shippingLastTrackedAt" IS NULL ` +
          `OR o."shippingLastTrackedAt" < NOW() - (INTERVAL '1 minute' * POWER(2, o."shippingRetryCount")))`,
      )
      .limit(10)
      .getMany();
    for (const order of stuck) {
      try {
        await this.bookAndProcess(order.id);
      } catch (err) {
        this.logger.error(
          `Retry failed for ${order.orderNumber}: ${
            err instanceof Error ? err.message : 'Unknown'
          }`,
        );
      }
    }
  }

  /**
   * Customer-facing tracking lookup. Returns the cached result if
   * we've polled AAJ within the TTL, otherwise re-polls and updates
   * the cache.
   */
  async getTracking(
    orderId: string,
    opts: { force?: boolean } = {},
  ): Promise<{
    trackingNumber: string | null;
    status: number | null;
    description: string;
    etaDays?: number;
    etaDate?: string;
    events: AajTrackingResult['events'];
    labelUrl?: string | null;
    optedOut: boolean;
    pending: boolean;
    lastError?: string | null;
  }> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (order.shippingOptOut) {
      return {
        trackingNumber: null,
        status: null,
        description: 'Customer opted out of shipping.',
        events: [],
        optedOut: true,
        pending: false,
      };
    }
    if (!order.shippingTrackingId) {
      return {
        trackingNumber: null,
        status: null,
        description: order.shippingLastError
          ? `Shipping setup pending — ${order.shippingLastError}`
          : 'Shipping setup is in progress.',
        events: [],
        optedOut: false,
        pending: true,
        lastError: order.shippingLastError ?? null,
      };
    }

    // Cache check.
    const cached =
      order.shippingLastTrackedAt &&
      Date.now() - order.shippingLastTrackedAt.getTime() <
        ShippingDispatchService.TRACKING_CACHE_TTL_MS;
    if (cached && !opts.force) {
      return {
        trackingNumber: order.shippingTrackingId,
        status: order.shippingStatus ?? 0,
        description: this.statusLabel(order.shippingStatus),
        events: order.shippingEvents ?? [],
        labelUrl: order.shippingLabelUrl ?? null,
        optedOut: false,
        pending: false,
      };
    }

    const res = await this.aaj.trackShipment(order.shippingTrackingId);
    if (!res.ok) {
      // Stale-while-error: return what we have rather than 500-ing.
      return {
        trackingNumber: order.shippingTrackingId,
        status: order.shippingStatus ?? 0,
        description: order.shippingEvents?.length
          ? this.statusLabel(order.shippingStatus)
          : 'Tracking momentarily unavailable. Try again shortly.',
        events: order.shippingEvents ?? [],
        labelUrl: order.shippingLabelUrl ?? null,
        optedOut: false,
        pending: false,
      };
    }

    await this.orderRepo.update(order.id, {
      shippingStatus: res.data.status,
      shippingEvents: res.data.events,
      shippingLastTrackedAt: new Date(),
    });
    return {
      trackingNumber: res.data.trackingNumber,
      status: res.data.status,
      description: res.data.description || this.statusLabel(res.data.status),
      etaDays: res.data.etaDays,
      etaDate: res.data.etaDate,
      events: res.data.events,
      labelUrl: order.shippingLabelUrl ?? null,
      optedOut: false,
      pending: false,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────

  private async markFailure(order: Order, message: string): Promise<void> {
    const next = (order.shippingRetryCount ?? 0) + 1;
    await this.orderRepo.update(order.id, {
      shippingRetryCount: next,
      shippingLastError: message,
      shippingLastTrackedAt: new Date(), // used as a back-off cursor
    });
    this.logger.warn(
      `Order ${order.orderNumber} shipping failure #${next}: ${message}`,
    );
  }

  /**
   * Resolve the sender (the Martinonoir branch we ship FROM).
   *
   * Preference order:
   *   1. order.branchId (POS sales have it stamped)
   *   2. AAJ_DEFAULT_BRANCH_ID env (storefront / mobile fallback)
   *   3. Any active branch as a last resort.
   */
  private async resolveSender(order: Order): Promise<AajAddress | null> {
    let branch: Branch | null = null;
    if (order.branchId) {
      branch = await this.branchRepo.findOne({ where: { id: order.branchId } });
    }
    if (!branch) {
      const defaultId = process.env['AAJ_DEFAULT_BRANCH_ID'] ?? '';
      if (defaultId) {
        branch = await this.branchRepo.findOne({ where: { id: defaultId } });
      }
    }
    if (!branch) {
      branch = await this.branchRepo.findOne({
        where: { isActive: true },
      });
    }
    if (!branch?.address) return null;

    const addr = branch.address;
    return {
      name: process.env['AAJ_SENDER_NAME'] ?? branch.name,
      phone: branch.phone ?? process.env['AAJ_SENDER_PHONE'] ?? '+2348000000000',
      email: process.env['AAJ_SENDER_EMAIL'] ?? 'support@martinonoir.com',
      company: 'Martinonoir',
      addressLine1: addr.line1 ?? '',
      addressLine2: addr.line2 ?? undefined,
      city: addr.city ?? '',
      state: addr.state ?? '',
      country: 'Nigeria',
      countryCode: (addr.countryCode ?? 'NG').toUpperCase(),
      postalCode: addr.postalCode ?? '100001',
    };
  }

  private async resolveReceiver(order: Order): Promise<AajAddress | null> {
    if (!order.shippingAddress) return null;
    const a = order.shippingAddress;
    // Country code: storefront stores ISO-3166-alpha-2 in `country`
    // today (e.g. "NG"). Some legacy rows stored "Nigeria" — normalise.
    const cc =
      a.country.length === 2 ? a.country.toUpperCase() : 'NG';
    const countryName = cc === 'NG' ? 'Nigeria' : a.country;
    // Pull contact name + email from the user when available.
    const user = order.userId
      ? await this.userRepo.findOne({ where: { id: order.userId } })
      : null;
    const email = user?.email ?? order.guestEmail ?? '';
    return {
      name: `${a.firstName} ${a.lastName}`.trim(),
      phone: a.phone ?? '+2348000000000',
      email: email || 'noreply@martinonoir.com',
      addressLine1: a.line1,
      addressLine2: a.line2,
      city: a.city,
      state: a.state,
      country: countryName,
      countryCode: cc,
      postalCode: a.postalCode ?? '100001',
    };
  }

  /**
   * Build the AAJ packages.packages[].items[] array from the order's
   * order_items. AAJ takes major-units prices (naira), not kobo.
   */
  private async resolveItems(order: Order): Promise<AajPackageItem[]> {
    const items = await this.orderRepo.manager
      .createQueryBuilder()
      .select(['oi.productName AS name', 'oi.quantity AS qty', 'oi.unitPrice AS price'])
      .from('order_items', 'oi')
      .where('oi."orderId" = :id', { id: order.id })
      .getRawMany<{ name: string; qty: number; price: string }>();
    if (items.length === 0) {
      return [
        { name: order.orderNumber, quantity: 1, price: 0 },
      ];
    }
    return items.map((i) => ({
      name: i.name,
      quantity: Number(i.qty),
      price: Math.round(Number(i.price) / 100),
      unitMeasurement: 'EA',
      excludePackingList: false,
    }));
  }

  /**
   * Total package weight in KG. We don't have per-item weight in the
   * order so we estimate at 0.5 kg per unit (Martinonoir is a bag
   * brand — heavier than typical). Override via env.
   */
  private async resolveWeight(order: Order): Promise<number> {
    const perUnit = Number(process.env['AAJ_DEFAULT_KG_PER_UNIT'] ?? '0.5');
    const count = await this.orderRepo.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(oi.quantity), 1)', 'total')
      .from('order_items', 'oi')
      .where('oi."orderId" = :id', { id: order.id })
      .getRawOne<{ total: string }>();
    const units = Number(count?.total ?? 1);
    return Math.max(0.5, Math.round(units * perUnit * 10) / 10);
  }

  private statusLabel(status: number | undefined | null): string {
    switch (status) {
      case 0:
        return 'Label created';
      case 1:
        return 'Picked up';
      case 2:
        return 'In transit';
      case 3:
        return 'Out for delivery';
      case 4:
        return 'Delivered';
      default:
        return 'Shipping setup pending';
    }
  }
}
