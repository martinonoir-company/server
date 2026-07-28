"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomersService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const customer_entity_1 = require("./entities/customer.entity");
let CustomersService = class CustomersService {
    constructor(customerRepo, addressRepo) {
        this.customerRepo = customerRepo;
        this.addressRepo = addressRepo;
    }
    async getOrCreate(userId) {
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
    async recordPurchase(userId, amount, currency) {
        const customer = await this.getOrCreate(userId);
        customer.totalOrders += 1;
        customer.lastOrderAt = new Date();
        if (currency === 'NGN') {
            customer.totalSpentNgn = Number(customer.totalSpentNgn) + amount;
            customer.avgOrderValueNgn = Math.floor(Number(customer.totalSpentNgn) / customer.totalOrders);
        }
        else {
            customer.totalSpentUsd = Number(customer.totalSpentUsd) + amount;
        }
        await this.customerRepo.save(customer);
    }
    async findAll(query) {
        const page = query.page ?? 1;
        const limit = Math.min(query.limit ?? 20, 100);
        const skip = (page - 1) * limit;
        const qb = this.customerRepo
            .createQueryBuilder('customer')
            .leftJoinAndSelect('customer.user', 'user')
            .leftJoinAndSelect('customer.addresses', 'address');
        if (query.search) {
            qb.andWhere('(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)', { search: `%${query.search}%` });
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
    async findOne(id) {
        const customer = await this.customerRepo.findOne({
            where: { id },
            relations: ['user', 'addresses'],
        });
        if (!customer)
            throw new common_1.NotFoundException(`Customer ${id} not found`);
        return customer;
    }
    async findByUserId(userId) {
        return this.customerRepo.findOne({
            where: { userId },
            relations: ['user', 'addresses'],
        });
    }
    async addTag(id, tag) {
        const customer = await this.findOne(id);
        if (!customer.tags.includes(tag)) {
            customer.tags.push(tag);
            await this.customerRepo.save(customer);
        }
        return customer;
    }
    async updateNotes(id, notes) {
        const customer = await this.findOne(id);
        customer.notes = notes;
        return this.customerRepo.save(customer);
    }
    async addAddress(customerId, data) {
        if (data.isDefault) {
            await this.addressRepo.update({ customerId, isDefault: true }, { isDefault: false });
        }
        const address = this.addressRepo.create({ ...data, customerId });
        return this.addressRepo.save(address);
    }
    async updateAddress(addressId, data) {
        const address = await this.addressRepo.findOneOrFail({ where: { id: addressId } });
        if (data.isDefault) {
            await this.addressRepo.update({ customerId: address.customerId, isDefault: true }, { isDefault: false });
        }
        Object.assign(address, data);
        return this.addressRepo.save(address);
    }
    async deleteAddress(addressId) {
        await this.addressRepo.softDelete(addressId);
    }
};
exports.CustomersService = CustomersService;
exports.CustomersService = CustomersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(customer_entity_1.Customer)),
    __param(1, (0, typeorm_1.InjectRepository)(customer_entity_1.CustomerAddress)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], CustomersService);
//# sourceMappingURL=customers.service.js.map