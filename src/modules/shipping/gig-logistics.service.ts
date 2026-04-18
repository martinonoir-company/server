import { Injectable, Logger } from '@nestjs/common';
import { generateUlid } from '../../shared/entities/base.entity';

export interface CourierShipmentInput {
  orderId: string;
  orderNumber: string;
  senderAddress: {
    line1: string;
    city: string;
    state: string;
    country: string;
  };
  recipientAddress: {
    firstName: string;
    lastName: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    country: string;
    phone?: string;
  };
  packageDetails: {
    weightKg: number;
    description: string;
    value: number;
    currency: string;
  };
}

export interface CourierShipmentResult {
  trackingNumber: string;
  carrier: string;
  estimatedDelivery: string;
  labelUrl?: string;
  status: 'BOOKED' | 'FAILED';
  providerReference?: string;
}

export interface TrackingEvent {
  timestamp: string;
  status: string;
  location: string;
  description: string;
}

export interface TrackingResult {
  trackingNumber: string;
  carrier: string;
  currentStatus: string;
  events: TrackingEvent[];
}

/**
 * GIG Logistics courier integration.
 * Set GIG_API_KEY and GIG_BASE_URL in env.
 * Without them, operates in stub mode for development.
 */
@Injectable()
export class GigLogisticsService {
  private readonly logger = new Logger(GigLogisticsService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly isLive: boolean;

  constructor() {
    this.apiKey = process.env['GIG_API_KEY'] ?? '';
    this.baseUrl = process.env['GIG_BASE_URL'] ?? 'https://giglogisticsapi.com/api/v1';
    this.isLive = !!this.apiKey;
    if (!this.isLive) {
      this.logger.warn('GIG_API_KEY not set — running in stub mode');
    }
  }

  /**
   * Create a shipment and get a tracking number.
   */
  async createShipment(input: CourierShipmentInput): Promise<CourierShipmentResult> {
    this.logger.log(`Creating shipment for order ${input.orderNumber}`);

    if (!this.isLive) {
      const trackingNumber = `GIG${Date.now().toString(36).toUpperCase()}${generateUlid().slice(-4)}`;
      return {
        trackingNumber,
        carrier: 'GIG Logistics',
        estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        status: 'BOOKED',
        providerReference: `STUB-${generateUlid()}`,
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/shipments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          SenderAddress: input.senderAddress.line1,
          SenderCity: input.senderAddress.city,
          SenderState: input.senderAddress.state,
          ReceiverName: `${input.recipientAddress.firstName} ${input.recipientAddress.lastName}`,
          ReceiverAddress: input.recipientAddress.line1,
          ReceiverCity: input.recipientAddress.city,
          ReceiverState: input.recipientAddress.state,
          ReceiverPhoneNumber: input.recipientAddress.phone ?? '',
          Weight: input.packageDetails.weightKg,
          PaymentType: 'Prepaid',
          Description: input.packageDetails.description,
          Value: input.packageDetails.value / 100,
          DeliveryType: 'Normal',
        }),
      });

      const data = await res.json();

      return {
        trackingNumber: data.WaybillNumber ?? `GIG-${generateUlid().slice(-8)}`,
        carrier: 'GIG Logistics',
        estimatedDelivery: data.EstimatedDeliveryDate ?? new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        status: 'BOOKED',
        providerReference: data.ShipmentId?.toString(),
        labelUrl: data.LabelUrl,
      };
    } catch (err) {
      this.logger.error(`GIG shipment creation failed: ${err instanceof Error ? err.message : 'Unknown'}`);
      return {
        trackingNumber: '',
        carrier: 'GIG Logistics',
        estimatedDelivery: '',
        status: 'FAILED',
      };
    }
  }

  /**
   * Track a shipment by tracking number.
   */
  async trackShipment(trackingNumber: string): Promise<TrackingResult> {
    this.logger.log(`Tracking shipment: ${trackingNumber}`);

    if (!this.isLive) {
      const now = new Date();
      return {
        trackingNumber,
        carrier: 'GIG Logistics',
        currentStatus: 'IN_TRANSIT',
        events: [
          {
            timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'PICKED_UP',
            location: 'Lagos Sorting Center',
            description: 'Package picked up from sender',
          },
          {
            timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'IN_TRANSIT',
            location: 'Lagos Hub',
            description: 'Package in transit to destination',
          },
        ],
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/shipments/track/${trackingNumber}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });

      const data = await res.json();

      return {
        trackingNumber,
        carrier: 'GIG Logistics',
        currentStatus: data.ShipmentStatus ?? 'UNKNOWN',
        events: (data.ShipmentTrackingEvents ?? []).map((e: Record<string, string>) => ({
          timestamp: e['EventDate'] ?? '',
          status: e['Status'] ?? '',
          location: e['Location'] ?? '',
          description: e['EventDescription'] ?? '',
        })),
      };
    } catch {
      return {
        trackingNumber,
        carrier: 'GIG Logistics',
        currentStatus: 'UNKNOWN',
        events: [],
      };
    }
  }
}
