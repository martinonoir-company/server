import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto, MoveCategoryDto } from './dto/category.dto';
export declare class CategoriesController {
    private readonly categoriesService;
    constructor(categoriesService: CategoriesService);
    create(dto: CreateCategoryDto): Promise<{
        data: import("./entities/category.entity").Category;
    }>;
    findAll(): Promise<{
        data: import("./entities/category.entity").Category[];
    }>;
    findTree(): Promise<{
        data: import("./entities/category.entity").Category[];
    }>;
    findPaginated(page?: string, limit?: string): Promise<{
        data: {
            items: import("./entities/category.entity").Category[];
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>;
    findBySlug(slug: string): Promise<{
        data: import("./entities/category.entity").Category;
    }>;
    findOne(id: string): Promise<{
        data: import("./entities/category.entity").Category;
    }>;
    update(id: string, dto: UpdateCategoryDto): Promise<{
        data: import("./entities/category.entity").Category;
    }>;
    move(id: string, dto: MoveCategoryDto): Promise<{
        data: import("./entities/category.entity").Category;
    }>;
    remove(id: string): Promise<{
        message: string;
    }>;
}
