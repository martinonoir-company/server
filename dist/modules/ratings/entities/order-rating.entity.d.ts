import { BaseEntity } from '../../../shared/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Order } from '../../orders/entities/order.entity';
export declare class OrderRating extends BaseEntity {
    orderId: string;
    order: Order;
    userId: string;
    user: User;
    stars: number;
    comment?: string | null;
}
