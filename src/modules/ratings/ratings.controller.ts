import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RatingsService } from './ratings.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';
import { Permission } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';

class CreateRatingDto {
  @IsString() orderId!: string;

  @IsInt() @Min(1) @Max(5) stars!: number;

  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

@Controller({ path: 'ratings', version: '1' })
@UseGuards(JwtAuthGuard)
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  // ── Admin: list all ratings ──
  //
  // Declared before the `:orderId`-style routes are not a concern here since
  // this path is a distinct literal segment. Gated by RATINGS_VIEW.
  @Get()
  @RequirePermissions(Permission.RATINGS_VIEW)
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const result = await this.ratingsService.findAllForAdmin({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
    });
    return { data: result };
  }

  // ── Customer: my rating for an order (null if not yet rated) ──
  @Get('order/:orderId')
  async getForOrder(
    @CurrentUser() user: User,
    @Param('orderId') orderId: string,
  ) {
    const rating = await this.ratingsService.findForUserOrder(user.id, orderId);
    return { data: rating };
  }

  // ── Customer: create / update a rating (paid orders only) ──
  @Post()
  async create(@CurrentUser() user: User, @Body() dto: CreateRatingDto) {
    const rating = await this.ratingsService.upsert(
      user.id,
      dto.orderId,
      dto.stars,
      dto.comment,
    );
    return { data: rating };
  }
}
