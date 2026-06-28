import {
  IsString,
  IsInt,
  IsBoolean,
  IsOptional,
  Min,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddCartItemDto {
  @IsString()
  variantId!: string;

  /**
   * Quantity to add. Added to the existing quantity if the variant is
   * already in the cart. Must be a positive integer.
   */
  @IsInt()
  @Min(1)
  quantity!: number;

  /** Add as a wholesale line (separate row from a retail line). */
  @IsOptional()
  @IsBoolean()
  isWholesale?: boolean;
}

export class UpdateCartQuantityDto {
  /**
   * Target absolute quantity. A value of 0 (or below) deletes the row —
   * mirrors the local-cart context behaviour.
   */
  @IsInt()
  @Min(0)
  quantity!: number;
}

export class MergeCartEntryDto {
  @IsString()
  variantId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class MergeCartDto {
  /**
   * Batch of entries from the guest's local cart. Called on login.
   * Adds each quantity on top of whatever is already stored server-side.
   * Capped to keep a malicious/corrupted client from flooding the DB.
   */
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => MergeCartEntryDto)
  items!: MergeCartEntryDto[];
}
