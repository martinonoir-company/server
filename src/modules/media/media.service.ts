import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ALLOWED_MIME_TYPES,
  AllowedMime,
  MAX_UPLOAD_BYTES,
} from './dto/media.dto';
import { ProductMedia, Product } from '../products/entities/product.entity';
import { CacheService } from '../../shared/services/cache.service';

export interface PresignResult {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  expiresIn: number;
  maxBytes: number;
}

const PRESIGN_TTL_SECONDS = 60 * 5; // 5 minutes

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly publicBase?: string;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(ProductMedia) private readonly mediaRepo: Repository<ProductMedia>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    private readonly cache: CacheService,
  ) {
    this.region = this.config.get<string>('AWS_S3_REGION', 'us-east-1');
    this.bucket = this.config.get<string>('AWS_S3_BUCKET_NAME', '');
    const accessKeyId = this.config.get<string>('AWS_S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_S3_SECRET_ACCESS_KEY');
    this.publicBase = this.config.get<string>('AWS_S3_PUBLIC_URL_BASE');

    const credentials =
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined;

    this.s3 = new S3Client({
      region: this.region,
      credentials,
    });
  }

  /**
   * Generate a presigned PUT URL scoped to the given filename +
   * contentType. The uploader must include the exact `Content-Type`
   * header that was signed, and is expected to respect the 10 MB size
   * cap (echoed back in `maxBytes` for the client to check before
   * initiating upload).
   */
  async presignUpload(input: {
    filename: string;
    contentType: AllowedMime;
    size: number;
    productId?: string;
    categoryId?: string;
  }): Promise<PresignResult> {
    if (!this.bucket) {
      throw new InternalServerErrorException(
        'S3 bucket is not configured — set AWS_S3_BUCKET_NAME',
      );
    }
    if (!ALLOWED_MIME_TYPES.includes(input.contentType)) {
      throw new InternalServerErrorException(
        'Unsupported image type — JPG and PNG only',
      );
    }
    if (input.size > MAX_UPLOAD_BYTES) {
      throw new InternalServerErrorException(
        `File exceeds 10 MB maximum (${input.size} bytes)`,
      );
    }

    const key = this.buildObjectKey(input.filename, {
      productId: input.productId,
      categoryId: input.categoryId,
    });
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.size,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: PRESIGN_TTL_SECONDS,
    });

    return {
      uploadUrl,
      key,
      publicUrl: this.publicUrlFor(key),
      expiresIn: PRESIGN_TTL_SECONDS,
      maxBytes: MAX_UPLOAD_BYTES,
    };
  }

  /**
   * Persist a ProductMedia row pointing at an already-uploaded object.
   * Called by the admin after the browser finishes PUT-ing the file to
   * S3 using the presigned URL.
   */
  async confirmUpload(input: {
    productId: string;
    key: string;
    altText?: string;
    sortOrder?: number;
  }): Promise<ProductMedia> {
    const product = await this.productRepo.findOne({
      where: { id: input.productId },
    });
    if (!product) {
      throw new NotFoundException(`Product ${input.productId} not found`);
    }

    const url = this.publicUrlFor(input.key);

    // Default sortOrder = next after existing media for the product
    let sortOrder = input.sortOrder;
    if (sortOrder === undefined) {
      const max = await this.mediaRepo
        .createQueryBuilder('m')
        .select('MAX(m.sortOrder)', 'max')
        .where('m.productId = :pid', { pid: input.productId })
        .getRawOne<{ max: number | null }>();
      sortOrder = (max?.max ?? -1) + 1;
    }

    const media = this.mediaRepo.create({
      productId: input.productId,
      url,
      altText: input.altText,
      mediaType: 'IMAGE',
      sortOrder,
    });
    const saved = await this.mediaRepo.save(media);

    await this.cache.invalidateProducts();
    return saved;
  }

  /**
   * Delete a ProductMedia row (and best-effort delete the object from S3).
   * Object deletion failures are logged but don't block the DB delete —
   * orphaned objects can be swept by a lifecycle rule.
   */
  async deleteMedia(mediaId: string): Promise<void> {
    const media = await this.mediaRepo.findOne({ where: { id: mediaId } });
    if (!media) throw new NotFoundException(`Media ${mediaId} not found`);

    const key = this.extractKeyFromUrl(media.url);
    if (key) {
      try {
        await this.s3.send(
          new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
        );
      } catch (err) {
        this.logger.warn(
          `Failed to remove S3 object ${key}: ${(err as Error).message}`,
        );
      }
    }

    await this.mediaRepo.remove(media);
    await this.cache.invalidateProducts();
  }

  /**
   * Reorder an entire product's media gallery. `orderedIds` is the new
   * sortOrder in ascending order (index 0 = first image). Ids not in
   * the list are left untouched.
   */
  async reorder(productId: string, orderedIds: string[]): Promise<ProductMedia[]> {
    const media = await this.mediaRepo.find({ where: { productId } });
    if (media.length === 0) return [];

    const byId = new Map(media.map((m) => [m.id, m]));
    const updates: ProductMedia[] = [];
    orderedIds.forEach((id, idx) => {
      const m = byId.get(id);
      if (m) {
        m.sortOrder = idx;
        updates.push(m);
      }
    });
    if (updates.length > 0) {
      await this.mediaRepo.save(updates);
      await this.cache.invalidateProducts();
    }
    return this.mediaRepo.find({
      where: { productId },
      order: { sortOrder: 'ASC' },
    });
  }

  /**
   * Resolve an uploaded S3 key to its public URL. Used by the category
   * image flow, which has no ProductMedia row — the URL is stored as a
   * flat string on the category itself.
   */
  resolvePublicUrl(key: string): string {
    return this.publicUrlFor(key);
  }

  // ── helpers ──

  private buildObjectKey(
    filename: string,
    scope: { productId?: string; categoryId?: string } = {},
  ): string {
    const clean = filename
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(-140);
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    let prefix: string;
    if (scope.categoryId) {
      prefix = `categories/${scope.categoryId}`;
    } else if (scope.productId) {
      prefix = `products/${scope.productId}`;
    } else {
      prefix = 'products/unassigned';
    }
    return `${prefix}/${stamp}-${rand}-${clean || 'upload'}`;
  }

  private publicUrlFor(key: string): string {
    if (this.publicBase) {
      return `${this.publicBase.replace(/\/+$/, '')}/${key}`;
    }
    // Virtual-hosted style URL
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  private extractKeyFromUrl(url: string): string | null {
    if (this.publicBase && url.startsWith(this.publicBase)) {
      return url.slice(this.publicBase.replace(/\/+$/, '').length + 1);
    }
    const vhost = `https://${this.bucket}.s3.${this.region}.amazonaws.com/`;
    if (url.startsWith(vhost)) return url.slice(vhost.length);
    return null;
  }
}
