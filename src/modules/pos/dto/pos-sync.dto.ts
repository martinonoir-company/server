import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  ValidateNested,
  Min,
  MaxLength,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── POS Transaction DTOs ──

export class PosTransactionItemDto {
  @IsString()
  variantId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  /** Wholesale unit price captured at POS (for display only — server re-resolves) */
  @IsNumber()
  unitPrice!: number;
}

export class PosPaymentDto {
  @IsEnum(['CASH', 'POS_TERMINAL', 'BANK_TRANSFER'])
  method!: 'CASH' | 'POS_TERMINAL' | 'BANK_TRANSFER';

  /** Amount paid via this method */
  @IsNumber()
  @Min(0)
  amount!: number;
}

export class PosTransactionDto {
  /** POS-generated UUID — serves as the idempotency key */
  @IsString()
  @MaxLength(64)
  transactionId!: string;

  @IsString()
  @MaxLength(100)
  terminalId!: string;

  @IsOptional()
  @IsString()
  staffId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosTransactionItemDto)
  items!: PosTransactionItemDto[];

  /** Split payment: one or more payment methods */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosPaymentDto)
  payments!: PosPaymentDto[];

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  /** ISO 8601 timestamp — when the sale happened at POS */
  @IsDateString()
  timestamp!: string;

  /** Coupon code applied at POS (server re-validates) */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  couponCode?: string;

  /** Manual discount amount (flat, in currency units) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  /** COUPON or MANUAL — which type of discount was applied */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  discountType?: string;

  /** Name of staff who applied the discount (for auditing) */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  staffName?: string;

  /** ISO 8601 timestamp when discount was applied */
  @IsOptional()
  @IsString()
  discountAppliedAt?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;
}

export class PosSyncBatchDto {
  @IsString()
  @MaxLength(100)
  terminalId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosTransactionDto)
  transactions!: PosTransactionDto[];
}

// ── Response Types ──

export interface PosTransactionResult {
  transactionId: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  orderId?: string;
  orderNumber?: string;
  reason?: string;
}

export interface PosSyncBatchResult {
  terminalId: string;
  processedAt: string;
  successful: { transactionId: string; orderId: string; orderNumber: string }[];
  failed: { transactionId: string; reason: string }[];
  skipped: { transactionId: string; reason: string }[];
  summary: {
    total: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
  };
}
