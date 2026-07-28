import { Repository } from 'typeorm';
import { Order } from '../orders/entities/order.entity';
import { Branch } from '../branches/entities/branch.entity';
import { User } from '../users/entities/user.entity';
import { AajProvider, AajTrackingResult } from './aaj.provider';
export declare class ShippingDispatchService {
    private readonly orderRepo;
    private readonly branchRepo;
    private readonly userRepo;
    private readonly aaj;
    private readonly logger;
    private static readonly TRACKING_CACHE_TTL_MS;
    private static readonly MAX_RETRIES;
    constructor(orderRepo: Repository<Order>, branchRepo: Repository<Branch>, userRepo: Repository<User>, aaj: AajProvider);
    bookAndProcess(orderId: string): Promise<void>;
    retryPending(): Promise<void>;
    getTracking(orderId: string, opts?: {
        force?: boolean;
    }): Promise<{
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
    }>;
    private markFailure;
    private resolveSender;
    private resolveReceiver;
    private resolveItems;
    private resolveWeight;
    private statusLabel;
}
