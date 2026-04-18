import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, ILike } from 'typeorm';
import { Customer, CustomerAddress } from './entities/customer.entity';

export interface CustomerQuery {
  search?: string;
  tag?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'totalOrders' | 'totalSpentNgn' | 'lastOrderAt';
  sortOrder?: 'ASC' | 'DESC';
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(CustomerAddress) private readonly addressRepo: Repository<CustomerAddress>,
  ) {}

  /**
   * Get or create a customer profile for a user.
   */
  async getOrCreate(userId: string): Promise<Customer> {
    let customer = await this.customerRepo.findOne({
      where: { userId },
      relations: ['user', 'addresses'],
    });

    if (!customer) {
      customer = this.customerRepo.create({ userId });
      customer = await this.customerRepo.save(customer);
      customer = await this.customerRepo.findOneOrFail({
        where: { id: customer.id },
        relations: ['user', 'addresses'],
      });
    }

    return customer;
  }

  /**
   * Record a purchase — updates CLV metrics.
   */
  async recordPurchase(userId: string, amount: number, currency: string): Promise<void> {
    const customer = await this.getOrCreate(userId);

    customer.totalOrders += 1;
    customer.lastOrderAt = new Date();

    if (currency === 'NGN') {
      customer.totalSpentNgn = Number(customer.totalSpentNgn) + amount;
      customer.avgOrderValueNgn = Math.floor(
        Number(customer.totalSpentNgn) / customer.totalOrders,
      );
    } else {
      customer.totalSpentUsd = Number(customer.totalSpentUsd) + amount;
    }

    await this.customerRepo.save(customer);
  }

  /**
   * List customers with search, filtering, and pagination.
   */
  async findAll(query: CustomerQuery): Promise<{
    items: Customer[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.customerRepo
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.user', 'user')
      .leftJoinAndSelect('customer.addresses', 'address');

    if (query.search) {
      qb.andWhere(
        '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.tag) {
      qb.andWhere("customer.tags @> :tag", { tag: JSON.stringify([query.tag]) });
    }

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'DESC';
    qb.orderBy(`customer.${sortBy}`, sortOrder);

    qb.skip(skip).take(limit);
    const [items, total] = await qb.getManyAndCount();

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.customerRepo.findOne({
      where: { id },
      relations: ['user', 'addresses'],
    });
    if (!customer) throw new NotFoundException(`Customer ${id} not found`);
    return customer;
  }

  async findByUserId(userId: string): Promise<Customer | null> {
    return this.customerRepo.findOne({
      where: { userId },
      relations: ['user', 'addresses'],
    });
  }

  /**
   * Add a tag to a customer.
   */
  async addTag(id: string, tag: string): Promise<Customer> {
    const customer = await this.findOne(id);
    if (!customer.tags.includes(tag)) {
      customer.tags.push(tag);
      await this.customerRepo.save(customer);
    }
    return customer;
  }

  /**
   * Update customer notes.
   */
  async updateNotes(id: string, notes: string): Promise<Customer> {
    const customer = await this.findOne(id);
    customer.notes = notes;
    return this.customerRepo.save(customer);
  }

  // ── Address Management ──

  async addAddress(customerId: string, data: Partial<CustomerAddress>): Promise<CustomerAddress> {
    // If setting as default, unset existing defaults
    if (data.isDefault) {
      await this.addressRepo.update({ customerId, isDefault: true }, { isDefault: false });
    }

    const address = this.addressRepo.create({ ...data, customerId });
    return this.addressRepo.save(address);
  }

  async updateAddress(addressId: string, data: Partial<CustomerAddress>): Promise<CustomerAddress> {
    const address = await this.addressRepo.findOneOrFail({ where: { id: addressId } });

    if (data.isDefault) {
      await this.addressRepo.update(
        { customerId: address.customerId, isDefault: true },
        { isDefault: false },
      );
    }

    Object.assign(address, data);
    return this.addressRepo.save(address);
  }

  async deleteAddress(addressId: string): Promise<void> {
    await this.addressRepo.softDelete(addressId);
  }
}
