import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import {
  AddCartItemDto,
  UpdateCartQuantityDto,
  MergeCartDto,
} from './dto/cart.dto';

@Controller({ path: 'cart', version: '1' })
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async getCart(@CurrentUser() user: User) {
    const items = await this.cartService.getCart(user.id);
    return { data: items };
  }

  @Get('count')
  async getCount(@CurrentUser() user: User) {
    const count = await this.cartService.getCount(user.id);
    return { data: { count } };
  }

  @Post()
  async addItem(
    @CurrentUser() user: User,
    @Body() dto: AddCartItemDto,
  ) {
    const item = await this.cartService.addItem(
      user.id,
      dto.variantId,
      dto.quantity,
      dto.isWholesale ?? false,
    );
    return { data: item };
  }

  @Patch(':variantId')
  async updateQuantity(
    @CurrentUser() user: User,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateCartQuantityDto,
  ) {
    const item = await this.cartService.updateQuantity(
      user.id,
      variantId,
      dto.quantity,
    );
    return { data: item };
  }

  @Delete(':variantId')
  async removeItem(
    @CurrentUser() user: User,
    @Param('variantId') variantId: string,
  ) {
    await this.cartService.removeItem(user.id, variantId);
    return { message: 'Removed from cart' };
  }

  @Delete()
  async clearCart(@CurrentUser() user: User) {
    await this.cartService.clearCart(user.id);
    return { message: 'Cart cleared' };
  }

  @Post('merge')
  async mergeCart(
    @CurrentUser() user: User,
    @Body() dto: MergeCartDto,
  ) {
    const items = await this.cartService.mergeCart(user.id, dto.items);
    return { data: items };
  }
}
