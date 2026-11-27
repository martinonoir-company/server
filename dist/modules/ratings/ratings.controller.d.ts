import { RatingsService } from './ratings.service';
import { User } from '../users/entities/user.entity';
declare class CreateRatingDto {
    orderId: string;
    stars: number;
    comment?: string;
}
export declare class RatingsController {
    private readonly ratingsService;
    constructor(ratingsService: RatingsService);
    list(page?: string, limit?: string, search?: string): Promise<{
        data: {
            items: import("./entities/order-rating.entity").OrderRating[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    getForOrder(user: User, orderId: string): Promise<{
        data: import("./entities/order-rating.entity").OrderRating | null;
    }>;
    create(user: User, dto: CreateRatingDto): Promise<{
        data: import("./entities/order-rating.entity").OrderRating;
    }>;
}
export {};
