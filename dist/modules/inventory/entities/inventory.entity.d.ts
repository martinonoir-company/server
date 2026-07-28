import { BaseEntity } from '../../../shared/entities/base.entity';
import { ProductVariant } from '../../products/entities/product.entity';
export declare enum MovementKind {
    RECEIPT = "RECEIPT",
    SALE = "SALE",
    RESERVATION = "RESERVATION",
    RELEASE = "RELEASE",
    RETURN = "RETURN",
    ADJUSTMENT = "ADJUSTMENT",
    TRANSFER_OUT = "TRANSFER_OUT",
    TRANSFER_IN = "TRANSFER_IN"
}
export declare class StockMovement extends BaseEntity {
    variantId: string;
    variant: ProductVariant;
    kind: MovementKind;
    quantity: number;
    warehouseCode: string;
    referenceId?: string;
    referenceType?: string;
    reason?: string;
    createdBy?: string;
    clientLineId?: string;
}
export declare class StockLevel {
    variantId: string;
    variant: ProductVariant;
    warehouseCode: string;
    onHand: number;
    reserved: number;
    get available(): number;
    lastMovementAt: Date;
}
