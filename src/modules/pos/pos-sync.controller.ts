import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { PosSyncService } from './pos-sync.service';
import { InventoryService } from '../inventory/inventory.service';
import { PosSyncBatchDto } from './dto/pos-sync.dto';

@Controller({ path: 'pos', version: '1' })
@UseGuards(JwtAuthGuard)
export class PosSyncController {
  constructor(
    private readonly posSyncService: PosSyncService,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * Batch sync POS transactions.
   * Processes each transaction sequentially. Returns per-transaction results.
   * Idempotent — duplicate transactionIds are silently skipped.
   */
  @Post('sync')
  async syncBatch(@Body() dto: PosSyncBatchDto) {
    const result = await this.posSyncService.processBatch(dto);
    return { data: result };
  }

  /**
   * Get all current stock levels for the POS product cache.
   */
  @Get('stock')
  async getAllStockLevels(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.inventoryService.getAllStockLevels({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return { data: result };
  }

  /**
   * Get stock level for a single variant (POS real-time check).
   */
  @Get('stock/:variantId')
  async getStockLevel(@Param('variantId') variantId: string) {
    const level = await this.inventoryService.getStockLevel(variantId);
    return { data: level };
  }
}
