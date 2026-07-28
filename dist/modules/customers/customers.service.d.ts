import { Repository } from 'typeorm';
import { Customer, CustomerAddress } from './entities/customer.entity';
export interface CustomerQuery {
    search?: string;
    tag?: string;
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'totalOrders' | 'totalSpentNgn' | 'lastOrderAt';
    sortOrder?: 'ASC' | 'DESC';
}
export declare class CustomersService {
    private readonly customerRepo;
    private readonly addressRepo;
    constructor(customerRepo: Repository<Customer>, addressRepo: Repository<CustomerAddress>);
    getOrCreate(userId: string): Promise<Customer>;
    recordPurchase(userId: string, amount: number, currency: string): Promise<void>;
    findAll(query: CustomerQuery): Promise<{
        items: Customer[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    findOne(id: string): Promise<Customer>;
    findByUserId(userId: string): Promise<Customer | null>;
    addTag(id: string, tag: string): Promise<Customer>;
    updateNotes(id: string, notes: string): Promise<Customer>;
    addAddress(customerId: string, data: Partial<CustomerAddress>): Promise<CustomerAddress>;
    updateAddress(addressId: string, data: Partial<CustomerAddress>): Promise<CustomerAddress>;
    deleteAddress(addressId: string): Promise<void>;
}
