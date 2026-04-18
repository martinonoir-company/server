import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  MaxLength,
  Min,
  ValidateNested,
  IsEnum,
  ArrayNotEmpty,
  ArrayMaxSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

// ── Create Variant ──

export class CreateVariantDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsString()
  @MaxLength(100)
  sku!: string;

  @IsNumber()
  @Min(0)
  retailPriceNgn!: number;

  @IsNumber()
  @Min(0)
  retailPriceUsd!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wholesalePriceNgn?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wholesalePriceUsd?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  compareAtPriceNgn?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  compareAtPriceUsd?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPriceNgn?: number;

  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @IsOptional()
  options?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;
}

// ── Create Product ──

export class CreateProductDto {
  @IsString()
  @MaxLength(300)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(26)
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  attributes?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants!: CreateVariantDto[];
}

// ── Update Product ──

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(26)
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  attributes?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

// ── Query ──

export class ProductQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsEnum(['name', 'createdAt', 'retailPriceNgn', 'retailPriceUsd'])
  sortBy?: string;

  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  /** Include soft-deleted products (admin only) */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  @IsBoolean()
  withDeleted?: boolean;

  /** Return ONLY soft-deleted products (admin trash view) */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  @IsBoolean()
  deletedOnly?: boolean;
}

// ── Bulk Update ──

export class BulkUpdateProductsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids!: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(26)
  categoryId?: string;
}
