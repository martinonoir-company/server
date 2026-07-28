import { BaseEntity } from '../../../shared/entities/base.entity';
export declare class Category extends BaseEntity {
    name: string;
    slug: string;
    description?: string;
    alias?: string;
    imageUrl?: string;
    sortOrder: number;
    isActive: boolean;
    metaTitle?: string;
    metaDescription?: string;
    children: Category[];
    parent?: Category;
}
