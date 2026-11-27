import { Repository } from 'typeorm';
import { OrderRating } from './entities/order-rating.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
export declare function isRateableStatus(status: OrderStatus): boolean;
export declare class RatingsService {
    private readonly ratingRepo;
    private readonly orderRepo;
    constructor(ratingRepo: Repository<OrderRating>, orderRepo: Repository<Order>);
    upsert(userId: string, orderId: string, stars: number, comment?: string): Promise<OrderRating>;
    findForUserOrder(userId: string, orderId: string): Promise<OrderRating | null>;
    findAllForAdmin(params: {
        page?: number;
        limit?: number;
        search?: string;
    }): Promise<{
        items: OrderRating[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
}
