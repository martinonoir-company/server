export declare const ALLOWED_MIME_TYPES: readonly ["image/jpeg", "image/png"];
export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];
export declare const MAX_UPLOAD_BYTES: number;
export declare class PresignUploadDto {
    filename: string;
    contentType: AllowedMime;
    size: number;
    productId?: string;
    categoryId?: string;
}
export declare class ConfirmCategoryUploadDto {
    key: string;
}
export declare class ConfirmUploadDto {
    productId: string;
    variantId?: string;
    key: string;
    altText?: string;
    sortOrder?: number;
}
