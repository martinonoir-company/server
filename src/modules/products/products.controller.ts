import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Header,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  BulkUpdateProductsDto,
} from './dto/product.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Public } from '../../shared/decorators/public.decorator';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';
import { Permission } from '../users/entities/role.entity';

@Controller({ path: 'products', version: '1' })
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ── Admin: Create Product ──
  @Post()
  async create(@Body() dto: CreateProductDto) {
    const product = await this.productsService.create(dto);
    return { data: product };
  }

  // ── Admin: Bulk Update ──
  @Patch('bulk')
  async bulkUpdate(@Body() dto: BulkUpdateProductsDto) {
    const result = await this.productsService.bulkUpdate(dto);
    return { data: result };
  }

  // ── Public: List Products (paginated, filterable) ──
  @Public()
  @Get()
  async findAll(@Query() query: ProductQueryDto) {
    const result = await this.productsService.findAll(query);
    return { data: result };
  }

  // ── Public: Get Product by Slug (storefront) ──
  @Public()
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const product = await this.productsService.findBySlug(slug);
    return { data: product };
  }

  // ─────────────────────────────────────────────────────────────
  // Variant lookup (scanner mobile app, POS quick-scan)
  //
  // Cacheable: variant identity rarely changes; stock comes from
  // /inventory/levels/:variantId so this payload can sit in HTTP cache
  // for a minute without staleness affecting checkout decisions.
  // ─────────────────────────────────────────────────────────────

  @Get('variants/by-sku/:code')
  @RequirePermissions(Permission.PRODUCTS_READ)
  @Header('Cache-Control', 'private, max-age=60')
  async findVariantBySku(@Param('code') code: string) {
    const variant = await this.productsService.findVariantBySku(code);
    return { data: variant };
  }

  @Get('variants/by-barcode/:code')
  @RequirePermissions(Permission.PRODUCTS_READ)
  @Header('Cache-Control', 'private, max-age=60')
  async findVariantByBarcode(@Param('code') code: string) {
    const variant = await this.productsService.findVariantByBarcode(code);
    return { data: variant };
  }

  // ── Admin: Get Product by ID (optionally includes soft-deleted) ──
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Query('withDeleted') withDeleted?: string,
  ) {
    const product = await this.productsService.findOne(id, {
      withDeleted: withDeleted === 'true' || withDeleted === '1',
    });
    return { data: product };
  }

  // ── Admin: Update Product ──
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    const product = await this.productsService.update(id, dto);
    return { data: product };
  }

  // ── Admin: Soft Delete ──
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.productsService.remove(id);
  }

  // ── Admin: Restore ──
  @Patch(':id/restore')
  async restore(@Param('id') id: string) {
    const product = await this.productsService.restore(id);
    return { data: product };
  }
}
