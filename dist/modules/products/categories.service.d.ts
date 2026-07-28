import { TreeRepository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto, MoveCategoryDto } from './dto/category.dto';
import { CacheService } from '../../shared/services/cache.service';
export declare class CategoriesService {
    private readonly categoryRepo;
    private readonly cache;
    constructor(categoryRepo: TreeRepository<Category>, cache: CacheService);
    create(dto: CreateCategoryDto): Promise<Category>;
    findAll(): Promise<Category[]>;
    findPaginated(page?: number, limit?: number): Promise<{
        items: Category[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    findTree(): Promise<Category[]>;
    findBySlug(slug: string): Promise<Category>;
    findOne(id: string): Promise<Category>;
    update(id: string, dto: UpdateCategoryDto): Promise<Category>;
    move(id: string, dto: MoveCategoryDto): Promise<Category>;
    remove(id: string): Promise<void>;
    private slugify;
    private generateUniqueSlug;
    private getDepth;
    private getSubtreeHeight;
    private measureHeight;
}
