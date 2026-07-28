export declare class AddCartItemDto {
    variantId: string;
    quantity: number;
    isWholesale?: boolean;
}
export declare class UpdateCartQuantityDto {
    quantity: number;
}
export declare class MergeCartEntryDto {
    variantId: string;
    quantity: number;
}
export declare class MergeCartDto {
    items: MergeCartEntryDto[];
}
