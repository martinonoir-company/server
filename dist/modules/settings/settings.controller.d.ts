import { SettingsService } from './settings.service';
import { User } from '../users/entities/user.entity';
declare class UpdateWholesaleMinQtyDto {
    wholesaleMinQty: number;
}
export declare class SettingsController {
    private readonly settingsService;
    constructor(settingsService: SettingsService);
    publicConfig(): Promise<{
        data: {
            wholesaleMinQty: number;
        };
    }>;
    getAll(): Promise<{
        data: {
            wholesaleMinQty: number;
        };
    }>;
    updateWholesaleMinQty(dto: UpdateWholesaleMinQtyDto, user?: User): Promise<{
        data: {
            wholesaleMinQty: number;
        };
    }>;
}
export {};
