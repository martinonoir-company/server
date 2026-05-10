import { Controller, Post, Get, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import {
  InventoryService,
  RecordMovementInput,
  RecordMovementBatchLine,
} from './inventory.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';
import { Permission } from '../users/entities/role.entity';
import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  Min,
  IsBoolean,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  IsUUID,
} from 'class-validator';
import { MovementKind } from './entities/inventory.entity';
import { Type } from 'class-transformer';

export class RecordMovementDto {
  @IsString() variantId!: string;
  @IsEnum(MovementKind) kind!: MovementKind;
  @IsNumber() @Min(1) quantity!: number;
  @IsOptional() @IsString() warehouseCode?: string;
  @IsOptional() @IsString() referenceId?: string;
  @IsOptional() @IsString() referenceType?: string;
  @IsOptional() @IsString() reason?: string;
}

/** One line in a batch movements request. */
export class RecordMovementBatchLineDto {
  @IsUUID() clientLineId!: string;
  @IsString() variantId!: string;
  @IsEnum(MovementKind) kind!: MovementKind;
  @IsNumber() @Min(1) quantity!: number;
  @IsOptional() @IsString() warehouseCode?: string;
  @IsOptional() @IsString() referenceId?: string;
  @IsOptional() @IsString() referenceType?: string;
  @IsOptional() @IsString() reason?: string;
}

/** Batch movements payload. */
export class RecordMovementBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RecordMovementBatchLineDto)
  lines!: RecordMovementBatchLineDto[];
}

export class StockLevelQueryDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) limit?: number;
  @IsOptional() @IsString() warehouseCode?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() lowStockOnly?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() lowStockThreshold?: number;
}

@Controller({ path: 'inventory', version: '1' })
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * Record a stock movement (admin: restock, adjustment, etc.)
   * createdBy is automatically set from the authenticated user's JWT.
   *
   * Requires `inventory:adjust`. SUPER_ADMIN bypasses RBAC. Granted to
   * COMPANY_SUPER_ADMIN and COMPANY_STAFF in PR #4's role migration.
   */
  @Post('movements')
  @RequirePermissions(Permission.INVENTORY_ADJUST)
  async recordMovement(@Body() dto: RecordMovementDto, @Request() req: any) {
    const input: RecordMovementInput = {
      ...dto,
      createdBy: req.user?.id ?? req.user?.sub,
    };
    const movement = await this.inventoryService.recordMovement(input);
    return { data: movement };
  }

  /**
   * Batch record stock movements (scanner mobile app: restock / returns).
   * All lines processed in ONE transaction — all succeed or all roll back.
   * Per-line idempotency via `clientLineId` (UUID).
   *
   * Requires `inventory:adjust`. COMPANY_STAFF gained this permission in
   * SCANNER_APP_PLAN.md PR #4.
   */
  @Post('movements/batch')
  @RequirePermissions(Permission.INVENTORY_ADJUST)
  async recordMovementsBatch(
    @Body() dto: RecordMovementBatchDto,
    @Request() req: any,
  ) {
    const createdBy: string | undefined = req.user?.id ?? req.user?.sub;
    const lines: RecordMovementBatchLine[] = dto.lines.map((l) => ({
      clientLineId: l.clientLineId,
      variantId: l.variantId,
      kind: l.kind,
      quantity: l.quantity,
      warehouseCode: l.warehouseCode,
      referenceId: l.referenceId,
      referenceType: l.referenceType,
      reason: l.reason,
    }));
    const result = await this.inventoryService.recordMovementsBatch(
      lines,
      createdBy,
    );
    return { data: result };
  }

  /**
   * Get all stock levels (paginated, filterable).
   * Used by admin inventory dashboard and POS catalog.
   */
  @Get('levels')
  async getAllStockLevels(@Query() query: StockLevelQueryDto) {
    const result = await this.inventoryService.getAllStockLevels(query);
    return { data: result };
  }

  /**
   * Get stock level for a specific variant.
   * Used by all frontends (storefront, mobile, admin, POS).
   */
  @Get('levels/:variantId')
  async getStockLevel(
    @Param('variantId') variantId: string,
    @Query('warehouse') warehouse?: string,
  ) {
    const level = await this.inventoryService.getStockLevel(variantId, warehouse);
    return { data: level };
  }

  /**
   * Get movement history for a variant (audit trail).
   * Used by admin.
   */
  @Get('movements/:variantId')
  async getMovementHistory(
    @Param('variantId') variantId: string,
    @Query('limit') limit?: number,
  ) {
    const result = await this.inventoryService.getMovementHistory(variantId, limit);
    return { data: result };
  }
}
