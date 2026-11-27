import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Order } from '../../orders/entities/order.entity';

/**
 * Order rating — a customer's 1–5 star rating of a completed order, with an
 * optional free-text comment.
 *
 * One rating per order (UNIQUE on orderId): submitting again updates the
 * existing row in place, so the rating prompt is safe to re-render anywhere.
 *
 * Ratings are only ever created for orders in a paid state (PAID / PROCESSING
 * / SHIPPED / DELIVERED) — enforced in RatingsService. Cancelled orders and
 * orders whose payment failed can never be rated.
 *
 * This table is additive and read-only to the rest of the system: no existing
 * flow (order FSM, dispatch queue, payments) reads or writes it. Only the
 * customer apps write it and the super-admin page reads it.
 */
@Entity('order_ratings')
@Unique('UQ_order_ratings_order', ['orderId'])
export class OrderRating extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 26 })
  orderId!: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  /** The customer who created the rating. */
  @Index()
  @Column({ type: 'varchar', length: 26 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  /** 1–5. Validated at the DTO and clamped in the service. */
  @Column({ type: 'smallint' })
  stars!: number;

  /** Optional free-text comment from the customer. */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  comment?: string | null;
}
