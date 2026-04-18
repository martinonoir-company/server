import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { IsString, IsOptional } from 'class-validator';

class AddToWishlistDto {
  @IsString() productId!: string;
  @IsOptional() @IsString() variantId?: string;
  @IsOptional() @IsString() note?: string;
}

@Controller({ path: 'wishlist', version: '1' })
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  /** Get the current user's full wishlist */
  @Get()
  async getWishlist(@CurrentUser() user: User) {
    const items = await this.wishlistService.getUserWishlist(user.id);
    return { data: items };
  }

  /** Get wishlist item count */
  @Get('count')
  async getCount(@CurrentUser() user: User) {
    const count = await this.wishlistService.getCount(user.id);
    return { data: { count } };
  }

  /** Check if specific products are wishlisted (batch) */
  @Get('check')
  async checkWishlisted(
    @CurrentUser() user: User,
    @Query('productIds') productIds: string,
  ) {
    const ids = productIds ? productIds.split(',') : [];
    const wishlisted = await this.wishlistService.getWishlistedProductIds(user.id, ids);
    return { data: { wishlisted } };
  }

  /** Add a product to wishlist (idempotent) */
  @Post()
  async addItem(
    @CurrentUser() user: User,
    @Body() dto: AddToWishlistDto,
  ) {
    const item = await this.wishlistService.addItem(
      user.id,
      dto.productId,
      dto.variantId,
      dto.note,
    );
    return { data: item };
  }

  /** Remove a product from wishlist */
  @Delete(':productId')
  async removeItem(
    @CurrentUser() user: User,
    @Param('productId') productId: string,
  ) {
    await this.wishlistService.removeItem(user.id, productId);
    return { message: 'Removed from wishlist' };
  }

  /** Clear entire wishlist */
  @Delete()
  async clearWishlist(@CurrentUser() user: User) {
    await this.wishlistService.clearWishlist(user.id);
    return { message: 'Wishlist cleared' };
  }
}
