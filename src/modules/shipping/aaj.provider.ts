import { Injectable, Logger } from '@nestjs/common';
import { requireNgStateCode } from './ng-state-codes';

/**
 * AAJ Express shipping integration.
 *
 * Docs: https://docs.aajexpress.org/
 *
 * Endpoints used:
 *   1. POST /quote                                — get shipping quote
 *   2. POST /partner/booking/create-booking/      — book the shipment
 *   3. POST /partner/booking/process-booking/:id  — turn booking into a
 *                                                   live shipment, returns
 *                                                   trackingId + label PDF
 *   4. GET  /partner/shipment/track-shipment/:id  — current shipment
 *                                                   status + event timeline
 *
 * Auth: static bearer in `Authorization: Bearer <AAJ_API_KEY>`.
 *
 * Failure model: every method returns a `{ ok: true, data }` or
 * `{ ok: false, error }` envelope. We never throw on a non-2xx — the
 * caller decides whether to retry, surface to UI, or fall back.
 *
 * Stub mode: when `AAJ_API_KEY` is unset, the provider returns
 * deterministic-shape stub responses so dev/CI can exercise the full
 * post-payment flow without burning real bookings.
 */

// ── Address shape we accept from the caller ─────────────────────

export interface AajAddress {
  /** Contact name on the parcel. */
  name: string;
  /** E.164 phone, e.g. +2348012345678. */
  phone: string;
  /** Notification email. */
  email: string;
  /** Optional company name. */
  company?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  /** Human-readable state, e.g. "Lagos". Code resolved automatically. */
  state: string;
  /**
   * Optional override of the resolved state-or-province code. Useful
   * for international addresses where AAJ wants the local 2-char code.
   * For Nigeria we always resolve from the state name.
   */
  stateOrProvinceCode?: string;
  /** ISO 3166-1 alpha-2, e.g. "NG". Required. */
  countryCode: string;
  /** Country name, e.g. "Nigeria". */
  country: string;
  /** Postal/ZIP code. AAJ requires this. */
  postalCode: string;
  landmark?: string;
}

export interface AajPackageItem {
  name: string;
  quantity: number;
  /** Item price in NGN — AAJ wants major units (naira), not kobo. */
  price: number;
  unitMeasurement?: string;
  hsCode?: string;
  manufacturerCountry?: string;
  excludePackingList?: boolean;
}

export interface AajPackageInput {
  /** Actual weight in KG. Min 0.1. */
  actualWeight: number;
  /** Use a predefined dimension id when set, or pass custom dimensions. */
  predefinedDimension?: string;
  dimension?: {
    length: number;
    width: number;
    height: number;
    weight: number;
  };
  items: AajPackageItem[];
}

// ── Result envelope ─────────────────────────────────────────────

export type AajResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; statusCode?: number; raw?: unknown };

// ── Operation return types (only the fields we consume) ─────────

export interface AajQuoteResult {
  /** Quote total in NGN (major units). Customer pays this for shipping. */
  totalNgn: number;
  /** Base shipping fee before taxes / surcharges. */
  shippingFeeNgn: number;
  /** Tax portion in NGN. */
  taxNgn: number;
  /** AAJ draft booking id; pass this on create-booking to honour price. */
  bookingId: string;
  /** ISO timestamp the quote expires at. After this, re-quote. */
  expiresAt: string;
  /** Estimated days to arrival. */
  etaDays: number;
  /** Estimated date of arrival. */
  etaDate: string;
  /** Raw quote for storage. */
  raw: Record<string, unknown>;
}

export interface AajCreateBookingResult {
  /** AAJ booking _id — input to processBooking. */
  bookingId: string;
  /** Human-readable booking reference (e.g. BKG693abab0…). */
  humanizedName: string;
  /** Final total amount on the booking in NGN. */
  totalNgn: number;
  /** Shipping fee component. */
  shippingFeeNgn: number;
  raw: Record<string, unknown>;
}

export interface AajProcessBookingResult {
  /** Customer-facing tracking id. */
  trackingId: string;
  /** URL of the printable shipping label PDF. */
  labelUrl?: string;
  raw: Record<string, unknown>;
}

export interface AajTrackingEvent {
  dateTime: string;
  /** 0=LABEL_CREATED, 1=PICKED_UP, 2=IN_TRANSIT, 3=OUT_FOR_DELIVERY, 4=DELIVERED. */
  status: number;
  scanType: string;
  description: string;
  location: string;
}

export interface AajTrackingResult {
  trackingNumber: string;
  /** Current shipment status — same enum as event-level status. */
  status: number;
  /** Latest event description. */
  description: string;
  etaDays?: number;
  etaDate?: string;
  events: AajTrackingEvent[];
  raw: Record<string, unknown>;
}

/** Minimal contact + address pair, what AAJ's quote payload needs. */
interface AajParty {
  contact: {
    name: string;
    phone: string;
    email: string;
    company?: string;
  };
  addressDetails: AajAddress;
}

@Injectable()
export class AajProvider {
  private readonly logger = new Logger(AajProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly isLive: boolean;
  private readonly defaultCategoryId: string;
  private readonly accountNumber: string;
  /** WALLET | CREDIT_FACILITY — picked by deployment. */
  private readonly paymentMethod: 'WALLET' | 'CREDIT_FACILITY';

  constructor() {
    const raw = process.env['AAJ_API_KEY'] ?? '';
    this.apiKey = raw.trim().replace(/^["']|["']$/g, '');
    this.baseUrl = (
      process.env['AAJ_BASE_URL'] ?? 'https://booking.aajexpress.org/api/v2'
    ).replace(/\/+$/, '');
    this.isLive = !!this.apiKey;
    this.defaultCategoryId = process.env['AAJ_DEFAULT_CATEGORY_ID'] ?? '';
    this.accountNumber = process.env['AAJ_ACCOUNT_NUMBER'] ?? '';
    this.paymentMethod =
      (process.env['AAJ_PAYMENT_METHOD'] as 'WALLET' | 'CREDIT_FACILITY') ??
      'WALLET';

    if (!this.isLive) {
      this.logger.warn(
        'AAJ_API_KEY not set — running in stub mode (no real bookings).',
      );
    } else if (!this.defaultCategoryId || !this.accountNumber) {
      this.logger.warn(
        'AAJ_DEFAULT_CATEGORY_ID and/or AAJ_ACCOUNT_NUMBER missing. ' +
          'Live calls will likely 400 on create-booking.',
      );
    }
  }

  // ── 1. Quote ────────────────────────────────────────────────

  /**
   * Get a shipping quote. AAJ honours the returned `bookingId` as a
   * draft so create-booking can quote-match exactly until expiry.
   *
   * `serviceType` defaults to DOMESTIC for NG→NG, AIR_EXPORT otherwise.
   * Customer-facing UI tells the customer the price may shift slightly
   * because AAJ's `expirationDate` puts a TTL on the quote.
   */
  async getQuote(input: {
    sender: AajAddress;
    receiver: AajAddress;
    /**
     * Customer-declared value of the items in NGN (major units). AAJ
     * uses this for insurance + customs.
     */
    itemsValueNgn: number;
    /** Total weight of all packages in KG. */
    weightKg: number;
    items?: AajPackageItem[];
    serviceType?: 'DOMESTIC' | 'AIR_EXPORT' | 'SEA_EXPORT' | 'AIR_IMPORT';
    deliveryMode?: 'DOOR_STEP' | 'PICKUP';
  }): Promise<AajResult<AajQuoteResult>> {
    const serviceType =
      input.serviceType ??
      (input.sender.countryCode === input.receiver.countryCode
        ? 'DOMESTIC'
        : 'AIR_EXPORT');
    const deliveryMode = input.deliveryMode ?? 'DOOR_STEP';

    // Normalise addresses (resolves NG state codes; passes others through).
    const senderAddress = this.prepareAddress(input.sender);
    const receiverAddress = this.prepareAddress(input.receiver);

    if (!this.isLive) {
      // Stub: deterministic shape so downstream code paths work. The
      // amount scales with weight so unit tests can assert behaviour.
      const total = Math.max(2000, Math.round(input.weightKg * 1500));
      return {
        ok: true,
        data: {
          totalNgn: total,
          shippingFeeNgn: Math.round(total * 0.93),
          taxNgn: Math.round(total * 0.07),
          bookingId: `STUB-${Date.now().toString(36)}`,
          expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
          etaDays: 3,
          etaDate: new Date(Date.now() + 3 * 86400 * 1000).toISOString(),
          raw: { stub: true },
        },
      };
    }

    const body = {
      sender: {
        addressDetails: this.addressForQuote(senderAddress),
      },
      receiver: {
        addressDetails: this.addressForQuote(receiverAddress),
      },
      serviceType,
      carrier: 'AAJ',
      packages: {
        itemsValue: Math.max(0, Math.round(input.itemsValueNgn)),
        packageType: 'regular',
        packages: [
          {
            actualWeight: Math.max(0.1, input.weightKg),
            ...(input.items
              ? {
                  items: input.items.map((i) => ({
                    name: i.name,
                    quantity: i.quantity,
                    price: i.price,
                  })),
                }
              : {}),
          },
        ],
      },
      deliveryMode,
    };

    const res = await this.post('/quote', body);
    if (!res.ok) return res as AajResult<never>;
    const data = res.data as {
      success?: boolean;
      data?: {
        quotes?: Array<{
          total: number;
          shippingFee: number;
          tax: number;
          booking: string;
          expirationDate?: string;
          eta?: { number_of_days?: number; date_of_arrival?: string };
        }>;
      };
    };
    const quote = data?.data?.quotes?.[0];
    if (!quote) {
      return {
        ok: false,
        error: 'AAJ returned no quote options',
        raw: data,
      };
    }
    return {
      ok: true,
      data: {
        totalNgn: Number(quote.total ?? 0),
        shippingFeeNgn: Number(quote.shippingFee ?? 0),
        taxNgn: Number(quote.tax ?? 0),
        bookingId: String(quote.booking),
        expiresAt:
          quote.expirationDate ??
          new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        etaDays: Number(quote.eta?.number_of_days ?? 3),
        etaDate:
          quote.eta?.date_of_arrival ??
          new Date(Date.now() + 3 * 86400 * 1000).toISOString(),
        raw: quote as unknown as Record<string, unknown>,
      },
    };
  }

  // ── 2. Create booking ───────────────────────────────────────

  /**
   * Convert a quote into a real booking. Passes `customBookingId` =
   * order number so AAJ idempotently returns the same booking on
   * retry (instead of duplicating).
   */
  async createBooking(input: {
    customBookingId: string;
    sender: AajAddress;
    receiver: AajAddress;
    itemsValueNgn: number;
    weightKg: number;
    items: AajPackageItem[];
    description?: string;
    serviceType?: 'DOMESTIC' | 'AIR_EXPORT' | 'SEA_EXPORT' | 'AIR_IMPORT';
    deliveryMode?: 'DOOR_STEP' | 'PICKUP';
    /** AAJ category id (env). */
    categoryId?: string;
  }): Promise<AajResult<AajCreateBookingResult>> {
    const serviceType =
      input.serviceType ??
      (input.sender.countryCode === input.receiver.countryCode
        ? 'DOMESTIC'
        : 'AIR_EXPORT');
    const deliveryMode = input.deliveryMode ?? 'DOOR_STEP';
    const categoryId = input.categoryId ?? this.defaultCategoryId;
    const senderAddress = this.prepareAddress(input.sender);
    const receiverAddress = this.prepareAddress(input.receiver);

    if (!this.isLive) {
      const bookingId = `STUB-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      return {
        ok: true,
        data: {
          bookingId,
          humanizedName: `BKG${bookingId}`,
          totalNgn: Math.max(2000, Math.round(input.weightKg * 1500)),
          shippingFeeNgn: Math.max(1860, Math.round(input.weightKg * 1395)),
          raw: { stub: true, customBookingId: input.customBookingId },
        },
      };
    }

    if (serviceType === 'DOMESTIC' && !categoryId) {
      return {
        ok: false,
        error:
          'AAJ_DEFAULT_CATEGORY_ID is not set — domestic bookings require it.',
      };
    }

    const body = {
      customBookingId: input.customBookingId,
      sender: {
        contact: {
          name: input.sender.name,
          phone: input.sender.phone,
          email: input.sender.email,
          ...(input.sender.company ? { company: input.sender.company } : {}),
        },
        addressDetails: this.addressForBooking(senderAddress),
      },
      receiver: {
        contact: {
          name: input.receiver.name,
          phone: input.receiver.phone,
          email: input.receiver.email,
          ...(input.receiver.company
            ? { company: input.receiver.company }
            : {}),
        },
        addressDetails: this.addressForBooking(receiverAddress),
      },
      packageInsurance: 'FR',
      packages: {
        packageType: 'regular',
        itemsValue: Math.max(0, Math.round(input.itemsValueNgn)),
        packages: [
          {
            unitMeasurement: 'KGS',
            actualWeight: Math.max(0.1, input.weightKg),
            items: input.items.map((i) => ({
              name: i.name,
              quantity: i.quantity,
              price: i.price,
              unitMeasurement: 'KGS',
              ...(i.hsCode ? { hsCode: i.hsCode } : {}),
              ...(i.manufacturerCountry
                ? { manufacturerCountry: i.manufacturerCountry }
                : {}),
              excludePackingList: i.excludePackingList ?? false,
            })),
          },
        ],
        addOns: [],
        createMultiple: false,
      },
      payments: {
        ...(this.accountNumber ? { accountNumber: this.accountNumber } : {}),
        transaction: {
          generateTransaction: true,
          method: this.paymentMethod,
        },
      },
      carrier: 'AAJ',
      serviceType,
      deliveryMode,
      description: input.description ?? 'Martinonoir order',
      ...(categoryId ? { category: categoryId } : {}),
      getAcknowledgementCopy: false,
    };

    const res = await this.post('/partner/booking/create-booking/', body);
    if (!res.ok) return res as AajResult<never>;
    const data = res.data as {
      success?: boolean;
      data?: {
        booking?: {
          _id?: string;
          id?: string;
          humanizedName?: string;
          totalAmount?: number;
          shippingFee?: number;
        };
      };
    };
    const booking = data?.data?.booking;
    if (!booking?._id && !booking?.id) {
      return {
        ok: false,
        error: 'AAJ create-booking returned no booking id',
        raw: data,
      };
    }
    return {
      ok: true,
      data: {
        bookingId: String(booking._id ?? booking.id),
        humanizedName: String(booking.humanizedName ?? ''),
        totalNgn: Number(booking.totalAmount ?? 0),
        shippingFeeNgn: Number(booking.shippingFee ?? 0),
        raw: booking as unknown as Record<string, unknown>,
      },
    };
  }

  // ── 3. Process booking ──────────────────────────────────────

  /**
   * Turn a DUE booking into a live shipment. Returns the customer-
   * facing tracking id + a label PDF URL.
   *
   * AAJ's process-booking is the actual point where the shipment
   * exists in their logistics network. Until this completes, the
   * customer has paid but the parcel isn't yet in the carrier's hands.
   */
  async processBooking(
    bookingId: string,
  ): Promise<AajResult<AajProcessBookingResult>> {
    if (!this.isLive) {
      const trackingId = `STUB${Date.now().toString(36).toUpperCase()}`;
      return {
        ok: true,
        data: {
          trackingId,
          labelUrl: `https://stub.aajexpress.example/labels/${trackingId}.pdf`,
          raw: { stub: true, bookingId },
        },
      };
    }
    const res = await this.post(
      `/partner/booking/process-booking/${encodeURIComponent(bookingId)}`,
      {},
    );
    if (!res.ok) return res as AajResult<never>;
    const data = res.data as {
      success?: boolean;
      data?: {
        payload?: {
          shipment?: {
            tracking_id?: string;
            labelDocuments?: string[];
          };
        };
      };
    };
    const shipment = data?.data?.payload?.shipment;
    if (!shipment?.tracking_id) {
      return {
        ok: false,
        error: 'AAJ process-booking returned no tracking id',
        raw: data,
      };
    }
    return {
      ok: true,
      data: {
        trackingId: shipment.tracking_id,
        labelUrl: shipment.labelDocuments?.[0],
        raw: shipment as unknown as Record<string, unknown>,
      },
    };
  }

  // ── 4. Track shipment ───────────────────────────────────────

  async trackShipment(
    trackingId: string,
  ): Promise<AajResult<AajTrackingResult>> {
    if (!this.isLive) {
      // Stub: synthesise a sensible event timeline so the storefront
      // / mobile UIs render something during dev.
      const now = Date.now();
      const events: AajTrackingEvent[] = [
        {
          dateTime: new Date(now - 2 * 86400 * 1000).toISOString(),
          status: 0,
          scanType: 'LABEL_CREATED',
          description: 'Label documents have been created',
          location: 'Online Branch',
        },
        {
          dateTime: new Date(now - 1 * 86400 * 1000).toISOString(),
          status: 1,
          scanType: 'PICKED_UP',
          description: 'Package picked up from sender',
          location: 'Lagos Sorting Centre',
        },
        {
          dateTime: new Date(now - 6 * 3600 * 1000).toISOString(),
          status: 2,
          scanType: 'IN_TRANSIT',
          description: 'In transit',
          location: 'Lagos Hub',
        },
      ];
      return {
        ok: true,
        data: {
          trackingNumber: trackingId,
          status: 2,
          description: 'In transit',
          etaDays: 2,
          etaDate: new Date(now + 2 * 86400 * 1000).toISOString(),
          events,
          raw: { stub: true },
        },
      };
    }
    const res = await this.get(
      `/partner/shipment/track-shipment/${encodeURIComponent(trackingId)}`,
    );
    if (!res.ok) return res as AajResult<never>;
    const data = res.data as {
      success?: boolean;
      data?: {
        trackingNumber?: string;
        status?: number;
        description?: string;
        eta?: { numberOfDays?: number; dateOfArrival?: string };
        events?: Array<{
          dateTime: string;
          scanType: string;
          description: string;
          meta?: { status?: number; location?: string };
        }>;
      };
    };
    const t = data?.data;
    if (!t) {
      return {
        ok: false,
        error: 'AAJ track-shipment returned no payload',
        raw: data,
      };
    }
    return {
      ok: true,
      data: {
        trackingNumber: t.trackingNumber ?? trackingId,
        status: Number(t.status ?? 0),
        description: t.description ?? '',
        etaDays: t.eta?.numberOfDays,
        etaDate: t.eta?.dateOfArrival,
        events: (t.events ?? []).map((e) => ({
          dateTime: e.dateTime,
          status: Number(e.meta?.status ?? 0),
          scanType: e.scanType,
          description: e.description,
          location: e.meta?.location ?? '',
        })),
        raw: t as unknown as Record<string, unknown>,
      },
    };
  }

  // ── Helpers ──────────────────────────────────────────────────

  /**
   * Fill in `stateOrProvinceCode` for Nigerian addresses. International
   * addresses pass through unchanged — the caller (or the upstream
   * form) is responsible for them.
   */
  private prepareAddress(addr: AajAddress): AajAddress {
    if (
      addr.countryCode?.toUpperCase() === 'NG' &&
      !addr.stateOrProvinceCode
    ) {
      const code = requireNgStateCode(addr.state);
      return { ...addr, stateOrProvinceCode: code };
    }
    return addr;
  }

  /** Minimal address fields the /quote endpoint needs. */
  private addressForQuote(addr: AajAddress) {
    return {
      country: addr.country,
      countryCode: addr.countryCode.toUpperCase(),
      stateOrProvinceCode: (addr.stateOrProvinceCode ?? '').toUpperCase(),
      state: addr.state,
      postalCode: addr.postalCode,
      city: addr.city,
    };
  }

  /** Full address fields the create-booking endpoint needs. */
  private addressForBooking(addr: AajAddress) {
    return {
      addressLine1: addr.addressLine1,
      ...(addr.addressLine2 ? { addressLine2: addr.addressLine2 } : {}),
      city: addr.city,
      state: addr.state,
      country: addr.country,
      countryCode: addr.countryCode.toUpperCase(),
      stateOrProvinceCode: (addr.stateOrProvinceCode ?? '').toUpperCase(),
      postalCode: addr.postalCode,
      ...(addr.landmark ? { landmark: addr.landmark } : {}),
    };
  }

  private async post(path: string, body: unknown): Promise<AajResult<unknown>> {
    return this.send('POST', path, body);
  }

  private async get(path: string): Promise<AajResult<unknown>> {
    return this.send('GET', path);
  }

  private async send(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<AajResult<unknown>> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = { raw: text };
      }
      if (!res.ok) {
        const message =
          (parsed as { message?: string })?.message ??
          (parsed as { error?: string })?.error ??
          `AAJ ${method} ${path} → ${res.status}`;
        this.logger.warn(
          `AAJ ${method} ${path} failed (${res.status}): ${message}`,
        );
        return { ok: false, error: message, statusCode: res.status, raw: parsed };
      }
      return { ok: true, data: parsed };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`AAJ ${method} ${path} threw: ${message}`);
      return { ok: false, error: message };
    }
  }
}
