"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MediaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const media_dto_1 = require("./dto/media.dto");
const product_entity_1 = require("../products/entities/product.entity");
const cache_service_1 = require("../../shared/services/cache.service");
const PRESIGN_TTL_SECONDS = 60 * 5;
let MediaService = MediaService_1 = class MediaService {
    constructor(config, mediaRepo, productRepo, cache) {
        this.config = config;
        this.mediaRepo = mediaRepo;
        this.productRepo = productRepo;
        this.cache = cache;
        this.logger = new common_1.Logger(MediaService_1.name);
        this.region = this.config.get('AWS_S3_REGION', 'us-east-1');
        this.bucket = this.config.get('AWS_S3_BUCKET_NAME', '');
        const accessKeyId = this.config.get('AWS_S3_ACCESS_KEY_ID');
        const secretAccessKey = this.config.get('AWS_S3_SECRET_ACCESS_KEY');
        this.publicBase = this.config.get('AWS_S3_PUBLIC_URL_BASE');
        const credentials = accessKeyId && secretAccessKey
            ? { accessKeyId, secretAccessKey }
            : undefined;
        this.s3 = new client_s3_1.S3Client({
            region: this.region,
            credentials,
        });
    }
    async presignUpload(input) {
        if (!this.bucket) {
            throw new common_1.InternalServerErrorException('S3 bucket is not configured — set AWS_S3_BUCKET_NAME');
        }
        if (!media_dto_1.ALLOWED_MIME_TYPES.includes(input.contentType)) {
            throw new common_1.InternalServerErrorException('Unsupported image type — JPG and PNG only');
        }
        if (input.size > media_dto_1.MAX_UPLOAD_BYTES) {
            throw new common_1.InternalServerErrorException(`File exceeds 10 MB maximum (${input.size} bytes)`);
        }
        const key = this.buildObjectKey(input.filename, {
            productId: input.productId,
            categoryId: input.categoryId,
        });
        const command = new client_s3_1.PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: input.contentType,
            ContentLength: input.size,
        });
        const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.s3, command, {
            expiresIn: PRESIGN_TTL_SECONDS,
        });
        return {
            uploadUrl,
            key,
            publicUrl: this.publicUrlFor(key),
            expiresIn: PRESIGN_TTL_SECONDS,
            maxBytes: media_dto_1.MAX_UPLOAD_BYTES,
        };
    }
    async confirmUpload(input) {
        const product = await this.productRepo.findOne({
            where: { id: input.productId },
        });
        if (!product) {
            throw new common_1.NotFoundException(`Product ${input.productId} not found`);
        }
        if (input.variantId) {
            const variant = await this.mediaRepo.manager.findOne(product_entity_1.ProductVariant, {
                where: { id: input.variantId, productId: input.productId },
            });
            if (!variant) {
                throw new common_1.NotFoundException(`Variant ${input.variantId} not found on product ${input.productId}`);
            }
        }
        const url = this.publicUrlFor(input.key);
        let sortOrder = input.sortOrder;
        if (sortOrder === undefined) {
            const qb = this.mediaRepo
                .createQueryBuilder('m')
                .select('MAX(m.sortOrder)', 'max')
                .where('m."productId" = :pid', { pid: input.productId });
            if (input.variantId) {
                qb.andWhere('m."variantId" = :vid', { vid: input.variantId });
            }
            else {
                qb.andWhere('m."variantId" IS NULL');
            }
            const max = await qb.getRawOne();
            sortOrder = (max?.max ?? -1) + 1;
        }
        const media = this.mediaRepo.create({
            productId: input.productId,
            variantId: input.variantId ?? null,
            url,
            altText: input.altText,
            mediaType: 'IMAGE',
            sortOrder,
        });
        const saved = await this.mediaRepo.save(media);
        await this.cache.invalidateProducts();
        return saved;
    }
    async deleteMedia(mediaId) {
        const media = await this.mediaRepo.findOne({ where: { id: mediaId } });
        if (!media)
            throw new common_1.NotFoundException(`Media ${mediaId} not found`);
        const key = this.extractKeyFromUrl(media.url);
        if (key) {
            try {
                await this.s3.send(new client_s3_1.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
            }
            catch (err) {
                this.logger.warn(`Failed to remove S3 object ${key}: ${err.message}`);
            }
        }
        await this.mediaRepo.remove(media);
        await this.cache.invalidateProducts();
    }
    async reorder(productId, orderedIds) {
        const media = await this.mediaRepo.find({ where: { productId } });
        if (media.length === 0)
            return [];
        const byId = new Map(media.map((m) => [m.id, m]));
        const updates = [];
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
        return this.mediaRepo
            .createQueryBuilder('m')
            .where('m.productId = :pid', { pid: productId })
            .orderBy('m.variantId', 'ASC', 'NULLS FIRST')
            .addOrderBy('m.sortOrder', 'ASC')
            .getMany();
    }
    resolvePublicUrl(key) {
        return this.publicUrlFor(key);
    }
    buildObjectKey(filename, scope = {}) {
        const clean = filename
            .toLowerCase()
            .replace(/[^a-z0-9._-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(-140);
        const stamp = Date.now().toString(36);
        const rand = Math.random().toString(36).slice(2, 8);
        let prefix;
        if (scope.categoryId) {
            prefix = `categories/${scope.categoryId}`;
        }
        else if (scope.productId) {
            prefix = `products/${scope.productId}`;
        }
        else {
            prefix = 'products/unassigned';
        }
        return `${prefix}/${stamp}-${rand}-${clean || 'upload'}`;
    }
    publicUrlFor(key) {
        if (this.publicBase) {
            return `${this.publicBase.replace(/\/+$/, '')}/${key}`;
        }
        return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    }
    extractKeyFromUrl(url) {
        if (this.publicBase && url.startsWith(this.publicBase)) {
            return url.slice(this.publicBase.replace(/\/+$/, '').length + 1);
        }
        const vhost = `https://${this.bucket}.s3.${this.region}.amazonaws.com/`;
        if (url.startsWith(vhost))
            return url.slice(vhost.length);
        return null;
    }
};
exports.MediaService = MediaService;
exports.MediaService = MediaService = MediaService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, typeorm_1.InjectRepository)(product_entity_1.ProductMedia)),
    __param(2, (0, typeorm_1.InjectRepository)(product_entity_1.Product)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        typeorm_2.Repository,
        typeorm_2.Repository,
        cache_service_1.CacheService])
], MediaService);
//# sourceMappingURL=media.service.js.map