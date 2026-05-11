import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** POST /pos-sessions/:terminalCode/open */
export class OpenSessionDto {
  /** Currency for the session. Defaults to NGN. */
  @IsOptional()
  @IsEnum(['NGN', 'USD'])
  currency?: 'NGN' | 'USD';
}

/** POST /pos-sessions/:terminalCode/items */
export class AddSessionItemDto {
  /** UUID generated client-side; idempotency key for this add. */
  @IsString()
  @Length(1, 64)
  clientLineId!: string;

  @IsString()
  @Length(1, 26)
  variantId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  /** Optimistic-concurrency version the client last read. */
  @IsInt()
  @Min(0)
  version!: number;
}

/** PATCH /pos-sessions/:terminalCode/items/:lineId */
export class UpdateSessionItemDto {
  /** New quantity. 0 removes the line. */
  @IsInt()
  @Min(0)
  quantity!: number;

  @IsInt()
  @Min(0)
  version!: number;
}

/** POST /pos-sessions/:terminalCode/payment-intent */
export class PaymentIntentDto {
  @IsInt()
  @Min(0)
  version!: number;

  /** Coupon code applied at payment time (server re-validates downstream). */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  couponCode?: string;

  /** Flat manual discount in MAJOR currency units (matches POS sync DTO). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsEnum(['COUPON', 'MANUAL'])
  discountType?: 'COUPON' | 'MANUAL';

  /** Name of the staff member who applied the discount (auditing). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  discountAppliedByName?: string;
}

/** One split-payment entry on confirm. Mirrors the POS sync payment DTO. */
export class ConfirmPaymentDto {
  @IsEnum(['CASH', 'POS_TERMINAL', 'BANK_TRANSFER'])
  method!: 'CASH' | 'POS_TERMINAL' | 'BANK_TRANSFER';

  /** Amount paid via this method, in MAJOR currency units. */
  @IsNumber()
  @Min(0)
  amount!: number;
}

/** POST /pos-sessions/:terminalCode/confirm */
export class ConfirmSessionDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmPaymentDto)
  payments!: ConfirmPaymentDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string;
}

/** POST /pos-sessions/:terminalCode/void */
export class VoidSessionDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
