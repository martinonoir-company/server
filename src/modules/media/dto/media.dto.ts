import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'] as const;
export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

/** 10 MB — enforced both in presign DTO and at upload time via S3 condition. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export class PresignUploadDto {
  @IsString()
  @MaxLength(200)
  filename!: string;

  @IsEnum(ALLOWED_MIME_TYPES, {
    message: 'contentType must be image/jpeg or image/png',
  })
  contentType!: AllowedMime;

  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES, {
    message: `File must be 10 MB or smaller (max ${MAX_UPLOAD_BYTES} bytes)`,
  })
  size!: number;

  /**
   * Optional product id to attach the upload key to. Lets us scope
   * S3 keys by product so uploads don't collide and the object store
   * mirrors the admin UI tree.
   */
  @IsOptional()
  @IsString()
  @MaxLength(26)
  productId?: string;

  /**
   * Optional category id. Scopes the S3 key under `categories/<id>/`.
   * Mutually exclusive with productId in practice — the caller passes
   * whichever entity the upload belongs to.
   */
  @IsOptional()
  @IsString()
  @MaxLength(26)
  categoryId?: string;
}

/**
 * Confirm a category image upload. Unlike product media there's no
 * ProductMedia row — the category stores a flat `imageUrl` string — so
 * this only resolves the uploaded key to its public URL. The caller then
 * PUTs that URL onto the category via PUT /categories/:id.
 */
export class ConfirmCategoryUploadDto {
  @IsString()
  @MaxLength(500)
  key!: string;
}

export class ConfirmUploadDto {
  @IsString()
  @MaxLength(26)
  productId!: string;

  @IsString()
  @MaxLength(500)
  key!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  altText?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
