import { BaseEntity } from '../../../shared/entities/base.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { Terminal } from '../../branches/entities/terminal.entity';
import { User } from '../../users/entities/user.entity';
export declare enum PosSessionStatus {
    ACTIVE = "ACTIVE",
    AWAITING_PAYMENT = "AWAITING_PAYMENT",
    COMPLETED = "COMPLETED",
    VOIDED = "VOIDED"
}
export interface PosSessionLine {
    clientLineId: string;
    variantId: string;
    productId: string;
    productName: string;
    variantName: string | null;
    sku: string;
    barcode: string | null;
    unitPrice: number;
    quantity: number;
    imageUrl: string | null;
    options: Record<string, string> | null;
    maxStock: number;
    scannedByStaffId: string;
    scannedAt: string;
}
export interface PosSessionCart {
    items: PosSessionLine[];
    currency: 'NGN' | 'USD';
    totals: {
        subtotal: number;
        discountTotal: number;
        grandTotal: number;
    };
    couponCode?: string | null;
    discountAmount?: number;
    discountType?: 'COUPON' | 'MANUAL' | null;
}
export declare class PosSession extends BaseEntity {
    terminalId: string;
    terminal?: Terminal;
    branchId: string;
    branch?: Branch;
    openedByStaffId: string;
    openedByStaff?: User;
    status: PosSessionStatus;
    cart: PosSessionCart;
    version: number;
    openedAt: Date;
    closedAt?: Date | null;
    resultOrderNumber?: string | null;
    resultOrderId?: string | null;
}
