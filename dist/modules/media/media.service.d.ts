import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AllowedMime } from './dto/media.dto';
import { ProductMedia, Product } from '../products/entities/product.entity';
import { CacheService } from '../../shared/services/cache.service';
export interface PresignResult {
    uploadUrl: string;
    key: string;
    publicUrl: string;
    expiresIn: number;
    maxBytes: number;
}
export declare class MediaService {
    private readonly config;
    private readonly mediaRepo;
    private readonly productRepo;
    private readonly cache;
    private readonly logger;
    private readonly s3;
    private readonly bucket;
    private readonly region;
    private readonly publicBase?;
    constructor(config: ConfigService, mediaRepo: Repository<ProductMedia>, productRepo: Repository<Product>, cache: CacheService);
    presignUpload(input: {
        filename: string;
        contentType: AllowedMime;
        size: number;
        productId?: string;
        categoryId?: string;
    }): Promise<PresignResult>;
    confirmUpload(input: {
        productId: string;
        variantId?: string | null;
        key: string;
        altText?: string;
        sortOrder?: number;
    }): Promise<ProductMedia>;
    deleteMedia(mediaId: string): Promise<void>;
    reorder(productId: string, orderedIds: string[]): Promise<ProductMedia[]>;
    resolvePublicUrl(key: string): string;
    private buildObjectKey;
    private publicUrlFor;
    private extractKeyFromUrl;
}
