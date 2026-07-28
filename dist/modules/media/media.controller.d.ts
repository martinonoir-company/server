import { MediaService } from './media.service';
import { ConfirmCategoryUploadDto, ConfirmUploadDto, PresignUploadDto } from './dto/media.dto';
declare class ReorderDto {
    orderedIds: string[];
}
export declare class MediaController {
    private readonly media;
    constructor(media: MediaService);
    presign(dto: PresignUploadDto): Promise<{
        data: import("./media.service").PresignResult;
    }>;
    confirm(dto: ConfirmUploadDto): Promise<{
        data: import("../products/entities/product.entity").ProductMedia;
    }>;
    confirmCategory(dto: ConfirmCategoryUploadDto): Promise<{
        data: {
            url: string;
        };
    }>;
    reorder(productId: string, dto: ReorderDto): Promise<{
        data: import("../products/entities/product.entity").ProductMedia[];
    }>;
    remove(id: string): Promise<void>;
}
export {};
