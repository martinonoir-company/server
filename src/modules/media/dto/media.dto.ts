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
