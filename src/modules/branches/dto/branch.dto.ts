import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Address payload — all fields optional. Stored as JSONB on Branch.
 */
export class BranchAddressDto {
  @IsOptional() @IsString() @MaxLength(200) line1?: string;
  @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) state?: string;
  @IsOptional() @IsString() @Length(2, 3) countryCode?: string;
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;
}

/**
 * Body for POST /branches.
 *
 * `code` and `warehouseCode` are validated as UPPERCASE alphanumerics with
 * dashes only (matches the existing convention used by 'POS-MAIN-01' /
 * 'DEFAULT' warehouseCode). They are unique-active and immutable after
 * creation.
 */
export class CreateBranchDto {
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9-]{0,49}$/, {
    message: 'code must be uppercase alphanumeric with optional dashes (max 50 chars)',
  })
  code!: string;

  @IsString()
  @Length(1, 200)
  name!: string;

  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9-]{0,99}$/, {
    message: 'warehouseCode must be uppercase alphanumeric with optional dashes (max 100 chars)',
  })
  warehouseCode!: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BranchAddressDto)
  address?: BranchAddressDto;

  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

/**
 * Body for PATCH /branches/:id.
 *
 * `code` and `warehouseCode` are intentionally absent — they are immutable.
 * The service rejects any attempt to write them.
 */
export class UpdateBranchDto {
  @IsOptional() @IsString() @Length(1, 200) name?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BranchAddressDto)
  address?: BranchAddressDto;

  @IsOptional() @IsString() @MaxLength(30) phone?: string;

  @IsOptional() @IsBoolean() isActive?: boolean;
}
