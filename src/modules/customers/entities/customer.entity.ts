import { Entity, Column, Index, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Customer profile — extends the base User with commerce-specific data.
 * A User becomes a Customer after their first purchase or explicit profile creation.
 */
@Entity('customers')
export class Customer extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 26 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  /** Total number of orders placed */
  @Column({ type: 'int', default: 0 })
  totalOrders!: number;

  /** Total lifetime spend in NGN (minor units) */
  @Column({ type: 'bigint', default: 0 })
  totalSpentNgn!: number;

  /** Total lifetime spend in USD (minor units) */
  @Column({ type: 'bigint', default: 0 })
  totalSpentUsd!: number;

  /** Last order date */
  @Column({ type: 'timestamptz', nullable: true })
  lastOrderAt?: Date;

  /** Average order value in NGN (minor units) — recomputed on each order */
  @Column({ type: 'bigint', default: 0 })
  avgOrderValueNgn!: number;

  /** Customer tags for segmentation (e.g., 'VIP', 'wholesale', 'influencer') */
  @Column({ type: 'jsonb', default: [] })
  tags!: string[];

  /** Internal staff notes about this customer */
  @Column({ type: 'text', nullable: true })
  notes?: string;

  /** Marketing opt-in */
  @Column({ type: 'boolean', default: false })
  marketingOptIn!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  marketingOptInAt?: Date;

  @OneToMany(() => CustomerAddress, (addr) => addr.customer, { cascade: true })
  addresses!: CustomerAddress[];
}

/**
 * Saved shipping/billing addresses for a customer.
 */
@Entity('customer_addresses')
export class CustomerAddress extends BaseEntity {
  @Column({ type: 'varchar', length: 26 })
  customerId!: string;

  @ManyToOne(() => Customer, (c) => c.addresses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer!: Customer;

  /** Label for the address (e.g., 'Home', 'Office', 'Warehouse') */
  @Column({ type: 'varchar', length: 50, default: 'Home' })
  label!: string;

  @Column({ type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ type: 'varchar', length: 100 })
  lastName!: string;

  @Column({ type: 'varchar', length: 500 })
  line1!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  line2?: string;

  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @Column({ type: 'varchar', length: 100 })
  state!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  postalCode?: string;

  @Column({ type: 'varchar', length: 3, default: 'NG' })
  country!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone?: string;

  /** Is this the default shipping address? */
  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;
}
