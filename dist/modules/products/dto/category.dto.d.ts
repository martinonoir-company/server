export declare class CreateCategoryDto {
    name: string;
    alias?: string;
    description?: string;
    imageUrl?: string;
    sortOrder?: number;
    isActive?: boolean;
    parentId?: string;
    metaTitle?: string;
    metaDescription?: string;
}
export declare class UpdateCategoryDto {
    name?: string;
    alias?: string;
    description?: string;
    imageUrl?: string;
    sortOrder?: number;
    isActive?: boolean;
    metaTitle?: string;
    metaDescription?: string;
}
export declare class MoveCategoryDto {
    parentId?: string | null;
    sortOrder?: number;
}
