import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';
import { Coupon, CouponStatus } from './entities/coupon.entity';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';
import { Permission } from '../users/entities/role.entity';

/**
 * Admin promotion (coupon / discount) management.
 *
 * Promotions are created and managed here, then consumed read-only by:
 *   - the storefront / mobile / POS via POST /orders/quote (coupon code)
 *   - the POS coupons page via GET /pos/pages/coupons
 *
 * All routes require a coupons:* permission; no @Public() routes.
 */
@Controller({ path: 'coupons', version: '1' })
@UseGuards(JwtAuthGuard)
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  @RequirePermissions(Permission.COUPONS_READ)
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const result = await this.couponsService.findAll({
      page: page ? parseInt(page, 10) || 1 : 1,
      limit: limit ? parseInt(limit, 10) || 20 : 20,
      status: status ? (status as CouponStatus) : undefined,
      search: search || undefined,
    });
    return { data: result };
  }

  @Get(':id')
  @RequirePermissions(Permission.COUPONS_READ)
  async findOne(@Param('id') id: string) {
    const coupon = await this.couponsService.findById(id);
    return { data: coupon };
  }

  @Post()
  @RequirePermissions(Permission.COUPONS_CREATE)
  async create(@Body() dto: CreateCouponDto, @Request() req: any) {
    const coupon = await this.couponsService.create({
      ...this.toEntityShape(dto),
      createdBy: req.user?.id ?? req.user?.sub,
    });
    return { data: coupon };
  }

  @Put(':id')
  @RequirePermissions(Permission.COUPONS_UPDATE)
  async update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    const coupon = await this.couponsService.update(
      id,
      this.toEntityShape(dto),
    );
    return { data: coupon };
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.COUPONS_UPDATE)
  async setStatus(
    @Param('id') id: string,
    @Body('status') status: CouponStatus,
  ) {
    const coupon = await this.couponsService.update(id, { status });
    return { data: coupon };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.COUPONS_DELETE)
  async remove(@Param('id') id: string) {
    await this.couponsService.remove(id);
  }

  /**
   * Look up auto-apply coupons that cover any of the cart's variants.
   * Open to authenticated requests on any channel — the storefront,
   * mobile app, and POS all call this when the cart changes so the
   * customer immediately sees a rescue discount without typing a code.
   *
   * The endpoint never picks a coupon — it returns candidates ranked
   * by expected discount magnitude, and the cart-side pricing engine
   * (or quote) applies them. This keeps the math in one place.
   */
  @Get('auto-apply/search')
  async findAutoApply(
    @Query('variantIds') variantIds?: string | string[],
    @Query('currency') currency?: string,
    @Query('channel') channel?: string,
  ) {
    const ids = Array.isArray(variantIds)
      ? variantIds
      : variantIds
        ? variantIds.split(',').filter(Boolean)
        : [];
    if (ids.length === 0) return { data: [] };
    const cur = (currency ?? 'NGN').toUpperCase();
    const ch = channel
      ? (channel.toUpperCase() as
          | 'STOREFRONT'
          | 'MOBILE'
          | 'POS')
      : undefined;
    const items = await this.couponsService.findAutoApplyCandidates(
      ids,
      cur,
      ch as never,
    );
    return {
      data: items.map((c) => ({
        id: c.id,
        code: c.code,
        description: c.description,
        discountType: c.discountType,
        discountValue: Number(c.discountValue),
        currency: c.currency,
        minimumOrderAmount: Number(c.minimumOrderAmount),
        maximumDiscount: Number(c.maximumDiscount),
        applicableVariantIds: c.applicableVariantIds,
        autoApply: c.autoApply,
      })),
    };
  }

  /**
   * Map a DTO onto the entity shape. The DTO carries ISO-8601 date strings;
   * the entity uses Date objects, so startsAt/expiresAt are converted here.
   */
  private toEntityShape(
    dto: CreateCouponDto | UpdateCouponDto,
  ): Partial<Coupon> {
    const { startsAt, expiresAt, ...rest } = dto;
    const out: Partial<Coupon> = { ...rest };
    if (startsAt !== undefined) {
      out.startsAt = startsAt ? new Date(startsAt) : undefined;
    }
    if (expiresAt !== undefined) {
      out.expiresAt = expiresAt ? new Date(expiresAt) : undefined;
    }
    return out;
  }
}
