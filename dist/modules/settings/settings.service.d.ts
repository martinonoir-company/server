import { DataSource } from 'typeorm';
export declare class SettingsService {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown, updatedBy?: string): Promise<void>;
    getWholesaleMinQty(): Promise<number>;
    setWholesaleMinQty(qty: number, updatedBy?: string): Promise<number>;
    getPublicConfig(): Promise<{
        wholesaleMinQty: number;
    }>;
}
