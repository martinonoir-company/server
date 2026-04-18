import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';

export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
  FREE_SHIPPING = 'FREE_SHIPPING',
}

export enum CouponStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  DISABLED = 'DISABLED',
}

@Entity('coupons')
export class Coupon extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: DiscountType })
  discountType!: DiscountType;

  /** For PERCENTAGE: value in whole percent (e.g. 15 = 15%). For FIXED_AMOUNT: value in minor units. */
  @Column({ type: 'bigint' })
  discountValue!: number;

  /** Currency for fixed-amount discounts */
  @Column({ type: 'varchar', length: 3, nullable: true })
  currency?: string;

  /** Minimum order subtotal (minor units) to qualify */
  @Column({ type: 'bigint', default: 0 })
  minimumOrderAmount!: number;

  /** Maximum discount amount for percentage coupons (minor units). 0 = no cap. */
  @Column({ type: 'bigint', default: 0 })
  maximumDiscount!: number;

  /** Total number of times this coupon can be used. 0 = unlimited. */
  @Column({ type: 'int', default: 0 })
  usageLimit!: number;

  /** How many times a single customer can use this coupon. 0 = unlimited. */
  @Column({ type: 'int', default: 1 })
  usageLimitPerCustomer!: number;

  /** How many times this coupon has been used so far. */
  @Column({ type: 'int', default: 0 })
  timesUsed!: number;

  @Column({ type: 'enum', enum: CouponStatus, default: CouponStatus.ACTIVE })
  status!: CouponStatus;

  @Column({ type: 'timestamptz', nullable: true })
  startsAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date;

  /** Restrict to specific product IDs (empty = applies to all) */
  @Column({ type: 'jsonb', default: [] })
  applicableProductIds!: string[];

  /** Restrict to specific category IDs */
  @Column({ type: 'jsonb', default: [] })
  applicableCategoryIds!: string[];

  /** Created by (staff user ID) */
  @Column({ type: 'varchar', length: 26, nullable: true })
  createdBy?: string;

  /** Check if this coupon is currently valid */
  get isValid(): boolean {
    if (this.status !== CouponStatus.ACTIVE) return false;
    const now = new Date();
    if (this.startsAt && now < this.startsAt) return false;
    if (this.expiresAt && now > this.expiresAt) return false;
    if (this.usageLimit > 0 && this.timesUsed >= this.usageLimit) return false;
    return true;
  }
}
