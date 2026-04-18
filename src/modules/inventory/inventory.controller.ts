import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { InventoryService, RecordMovementInput } from './inventory.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { IsString, IsNumber, IsEnum, IsOptional, Min } from 'class-validator';
import { MovementKind } from './entities/inventory.entity';

export class RecordMovementDto {
  @IsString() variantId!: string;
  @IsEnum(MovementKind) kind!: MovementKind;
  @IsNumber() @Min(1) quantity!: number;
  @IsOptional() @IsString() warehouseCode?: string;
  @IsOptional() @IsString() referenceId?: string;
  @IsOptional() @IsString() referenceType?: string;
  @IsOptional() @IsString() reason?: string;
}

@Controller({ path: 'inventory', version: '1' })
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('movements')
  async recordMovement(@Body() dto: RecordMovementDto) {
    const movement = await this.inventoryService.recordMovement(dto);
    return { data: movement };
  }

  @Get('levels/:variantId')
  async getStockLevel(
    @Param('variantId') variantId: string,
    @Query('warehouse') warehouse?: string,
  ) {
    const level = await this.inventoryService.getStockLevel(variantId, warehouse);
    return { data: level };
  }

  @Get('movements/:variantId')
  async getMovementHistory(
    @Param('variantId') variantId: string,
    @Query('limit') limit?: number,
  ) {
    const result = await this.inventoryService.getMovementHistory(variantId, limit);
    return { data: result };
  }
}
