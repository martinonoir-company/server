import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { OrderRating } from './entities/order-rating.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';

/**
 * Order statuses a customer is allowed to rate.
 *
 * Only orders whose payment actually succeeded. DRAFT and PENDING_PAYMENT are
 * not yet paid; CANCELLED never completed. Everything else in the FSM is part
 * of the paid lineage (PAID → … → DELIVERED, plus the return/refund tail which
 * can only be reached from a paid order), so those remain rateable.
 */
const RATEABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.RETURN_REQUESTED,
  OrderStatus.RETURN_APPROVED,
  OrderStatus.RETURNED,
  OrderStatus.REFUNDED,
];

export function isRateableStatus(status: OrderStatus): boolean {
  return RATEABLE_STATUSES.includes(status);
}

@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(OrderRating)
    private readonly ratingRepo: Repository<OrderRating>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  /**
   * Create or update the current user's rating for one of their own orders.
   *
   * Guards (all enforced server-side, not just in the UI):
   *  - the order exists;
   *  - the order belongs to this user;
   *  - the order is in a paid state (never DRAFT / PENDING_PAYMENT / CANCELLED).
   *
   * Idempotent: one rating per order. A second submit updates the existing row.
   */
  async upsert(
    userId: string,
    orderId: string,
    stars: number,
    comment?: string,
  ): Promise<OrderRating> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.userId !== userId) {
      throw new ForbiddenException('You can only rate your own orders');
    }
    if (!isRateableStatus(order.status)) {
      throw new BadRequestException(
        'This order cannot be rated. Only successfully paid orders can be rated.',
      );
    }

    const clampedStars = Math.min(5, Math.max(1, Math.round(stars)));
    const trimmedComment = comment?.trim() ? comment.trim() : null;

    const existing = await this.ratingRepo.findOne({ where: { orderId } });
    if (existing) {
      existing.stars = clampedStars;
      existing.comment = trimmedComment;
      return this.ratingRepo.save(existing);
    }

    const rating = this.ratingRepo.create({
      orderId,
      userId,
      stars: clampedStars,
      comment: trimmedComment,
    });
    return this.ratingRepo.save(rating);
  }

  /**
   * The current user's rating for a specific order, or null if not yet rated.
   * Scoped to the user so one customer can't read another's rating.
   */
  async findForUserOrder(
    userId: string,
    orderId: string,
  ): Promise<OrderRating | null> {
    return this.ratingRepo.findOne({ where: { orderId, userId } });
  }

  /**
   * Admin list: all ratings, newest first, with the customer and order joined
   * so the super-admin page can show who rated, which order, and when.
   */
  async findAllForAdmin(params: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{
    items: OrderRating[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));

    const qb = this.ratingRepo
      .createQueryBuilder('rating')
      .leftJoinAndSelect('rating.user', 'user')
      .leftJoinAndSelect('rating.order', 'order')
      .orderBy('rating.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const search = params.search?.trim();
    if (search) {
      const like = `%${search}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('order.orderNumber ILIKE :like', { like })
            .orWhere('user.email ILIKE :like', { like })
            .orWhere('user.firstName ILIKE :like', { like })
            .orWhere('user.lastName ILIKE :like', { like })
            .orWhere('rating.comment ILIKE :like', { like });
        }),
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
