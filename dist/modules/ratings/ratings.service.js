"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RatingsService = void 0;
exports.isRateableStatus = isRateableStatus;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const order_rating_entity_1 = require("./entities/order-rating.entity");
const order_entity_1 = require("../orders/entities/order.entity");
const RATEABLE_STATUSES = [
    order_entity_1.OrderStatus.PAID,
    order_entity_1.OrderStatus.PROCESSING,
    order_entity_1.OrderStatus.SHIPPED,
    order_entity_1.OrderStatus.DELIVERED,
    order_entity_1.OrderStatus.RETURN_REQUESTED,
    order_entity_1.OrderStatus.RETURN_APPROVED,
    order_entity_1.OrderStatus.RETURNED,
    order_entity_1.OrderStatus.REFUNDED,
];
function isRateableStatus(status) {
    return RATEABLE_STATUSES.includes(status);
}
let RatingsService = class RatingsService {
    constructor(ratingRepo, orderRepo) {
        this.ratingRepo = ratingRepo;
        this.orderRepo = orderRepo;
    }
    async upsert(userId, orderId, stars, comment) {
        const order = await this.orderRepo.findOne({ where: { id: orderId } });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        if (order.userId !== userId) {
            throw new common_1.ForbiddenException('You can only rate your own orders');
        }
        if (!isRateableStatus(order.status)) {
            throw new common_1.BadRequestException('This order cannot be rated. Only successfully paid orders can be rated.');
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
    async findForUserOrder(userId, orderId) {
        return this.ratingRepo.findOne({ where: { orderId, userId } });
    }
    async findAllForAdmin(params) {
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
            qb.andWhere(new typeorm_2.Brackets((w) => {
                w.where('order.orderNumber ILIKE :like', { like })
                    .orWhere('user.email ILIKE :like', { like })
                    .orWhere('user.firstName ILIKE :like', { like })
                    .orWhere('user.lastName ILIKE :like', { like })
                    .orWhere('rating.comment ILIKE :like', { like });
            }));
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
};
exports.RatingsService = RatingsService;
exports.RatingsService = RatingsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(order_rating_entity_1.OrderRating)),
    __param(1, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], RatingsService);
//# sourceMappingURL=ratings.service.js.map