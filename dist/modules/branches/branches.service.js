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
exports.BranchesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const branch_entity_1 = require("./entities/branch.entity");
const terminal_entity_1 = require("./entities/terminal.entity");
const user_branch_entity_1 = require("./entities/user-branch.entity");
const user_entity_1 = require("../users/entities/user.entity");
let BranchesService = class BranchesService {
    constructor(branchRepo, terminalRepo, userBranchRepo, userRepo, dataSource) {
        this.branchRepo = branchRepo;
        this.terminalRepo = terminalRepo;
        this.userBranchRepo = userBranchRepo;
        this.userRepo = userRepo;
        this.dataSource = dataSource;
    }
    async listForUser(user) {
        const isPrivileged = user.role === user_entity_1.UserRole.SUPER_ADMIN || user.role === user_entity_1.UserRole.COMPANY_SUPER_ADMIN;
        if (isPrivileged) {
            return this.branchRepo.find({
                where: { deletedAt: (0, typeorm_2.IsNull)() },
                order: { createdAt: 'ASC' },
            });
        }
        const rows = await this.userBranchRepo
            .createQueryBuilder('ub')
            .innerJoin('branches', 'b', 'b.id = ub.branchId AND b."deletedAt" IS NULL')
            .where('ub.userId = :userId', { userId: user.id })
            .andWhere('ub."deletedAt" IS NULL')
            .select(['ub.branchId AS "branchId"'])
            .getRawMany();
        if (rows.length === 0)
            return [];
        const ids = rows.map((r) => r.branchId);
        return this.branchRepo.find({
            where: ids.map((id) => ({ id, deletedAt: (0, typeorm_2.IsNull)() })),
            order: { createdAt: 'ASC' },
        });
    }
    async getByIdForUser(id, user) {
        const branch = await this.branchRepo.findOne({ where: { id, deletedAt: (0, typeorm_2.IsNull)() } });
        if (!branch)
            throw new common_1.NotFoundException('Branch not found');
        const isPrivileged = user.role === user_entity_1.UserRole.SUPER_ADMIN || user.role === user_entity_1.UserRole.COMPANY_SUPER_ADMIN;
        if (isPrivileged)
            return branch;
        const assignment = await this.userBranchRepo.findOne({
            where: { branchId: id, userId: user.id, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (!assignment) {
            throw new common_1.ForbiddenException('Not assigned to this branch');
        }
        return branch;
    }
    async create(dto) {
        const code = dto.code.toUpperCase();
        const warehouseCode = dto.warehouseCode.toUpperCase();
        await this.assertCodeAvailable(code);
        await this.assertWarehouseCodeAvailable(warehouseCode);
        const branch = this.branchRepo.create({
            code,
            name: dto.name,
            warehouseCode,
            address: dto.address ?? null,
            phone: dto.phone ?? null,
            isActive: true,
        });
        return this.branchRepo.save(branch);
    }
    async update(id, dto) {
        if ('code' in dto || 'warehouseCode' in dto) {
            throw new common_1.ConflictException('code and warehouseCode are immutable');
        }
        const branch = await this.branchRepo.findOne({ where: { id, deletedAt: (0, typeorm_2.IsNull)() } });
        if (!branch)
            throw new common_1.NotFoundException('Branch not found');
        if (dto.name !== undefined)
            branch.name = dto.name;
        if (dto.address !== undefined)
            branch.address = dto.address;
        if (dto.phone !== undefined)
            branch.phone = dto.phone;
        if (dto.isActive !== undefined) {
            if (branch.isActive && dto.isActive === false) {
                await this.assertNoBlockingDependencies(branch);
                await this.assertNotLastActive(branch.id);
            }
            branch.isActive = dto.isActive;
        }
        return this.branchRepo.save(branch);
    }
    async softDelete(id) {
        const branch = await this.branchRepo.findOne({ where: { id, deletedAt: (0, typeorm_2.IsNull)() } });
        if (!branch)
            throw new common_1.NotFoundException('Branch not found');
        await this.assertNotLastActive(branch.id);
        await this.assertNoBlockingDependencies(branch);
        const now = new Date();
        await this.dataSource.transaction(async (em) => {
            await em
                .createQueryBuilder()
                .update(branch_entity_1.Branch)
                .set({ deletedAt: now, isActive: false })
                .where('id = :id AND "deletedAt" IS NULL', { id: branch.id })
                .execute();
            await em
                .createQueryBuilder()
                .update(terminal_entity_1.Terminal)
                .set({ deletedAt: now, isActive: false })
                .where('"branchId" = :branchId AND "deletedAt" IS NULL', { branchId: branch.id })
                .execute();
            await em
                .createQueryBuilder()
                .update(user_branch_entity_1.UserBranch)
                .set({ deletedAt: now })
                .where('"branchId" = :branchId AND "deletedAt" IS NULL', { branchId: branch.id })
                .execute();
        });
        return { deletedAt: now };
    }
    async listTerminals(branchId, user) {
        await this.getByIdForUser(branchId, user);
        return this.terminalRepo.find({
            where: { branchId, deletedAt: (0, typeorm_2.IsNull)() },
            order: { createdAt: 'ASC' },
        });
    }
    async createTerminal(branchId, dto) {
        const branch = await this.branchRepo.findOne({ where: { id: branchId, deletedAt: (0, typeorm_2.IsNull)() } });
        if (!branch)
            throw new common_1.NotFoundException('Branch not found');
        if (!branch.isActive) {
            throw new common_1.ConflictException('Cannot add terminal to an inactive branch');
        }
        const code = dto.code.toUpperCase();
        await this.assertTerminalCodeAvailable(code);
        const terminal = this.terminalRepo.create({
            code,
            name: dto.name,
            branchId,
            isActive: true,
            moniepointTerminalSerial: dto.moniepointTerminalSerial?.trim() || null,
        });
        return this.terminalRepo.save(terminal);
    }
    async updateTerminal(branchId, terminalId, dto) {
        if ('code' in dto) {
            throw new common_1.ConflictException('terminal code is immutable');
        }
        const terminal = await this.terminalRepo.findOne({
            where: { id: terminalId, branchId, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (!terminal)
            throw new common_1.NotFoundException('Terminal not found');
        if (dto.name !== undefined)
            terminal.name = dto.name;
        if (dto.moniepointTerminalSerial !== undefined) {
            terminal.moniepointTerminalSerial =
                dto.moniepointTerminalSerial.trim() || null;
        }
        if (dto.isActive !== undefined) {
            if (terminal.isActive && dto.isActive === false) {
                await this.assertNoActiveSessionForTerminal(terminal.id);
            }
            terminal.isActive = dto.isActive;
        }
        return this.terminalRepo.save(terminal);
    }
    async softDeleteTerminal(branchId, terminalId) {
        const terminal = await this.terminalRepo.findOne({
            where: { id: terminalId, branchId, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (!terminal)
            throw new common_1.NotFoundException('Terminal not found');
        await this.assertNoActiveSessionForTerminal(terminal.id);
        const now = new Date();
        await this.terminalRepo.update({ id: terminal.id }, { deletedAt: now, isActive: false });
        return { deletedAt: now };
    }
    async listStaff(branchId) {
        const branch = await this.branchRepo.findOne({
            where: { id: branchId, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (!branch)
            throw new common_1.NotFoundException('Branch not found');
        const rows = await this.userBranchRepo
            .createQueryBuilder('ub')
            .innerJoin('users', 'u', 'u.id = ub."userId" AND u."deletedAt" IS NULL')
            .where('ub."branchId" = :branchId', { branchId })
            .andWhere('ub."deletedAt" IS NULL')
            .orderBy('ub."createdAt"', 'ASC')
            .select([
            'ub.id            AS "assignmentId"',
            'ub."userId"      AS "userId"',
            'u."firstName"    AS "firstName"',
            'u."lastName"     AS "lastName"',
            'u.email          AS "email"',
            'u.role           AS "role"',
            'ub."createdAt"   AS "assignedAt"',
        ])
            .getRawMany();
        return rows.map((r) => ({
            assignmentId: r.assignmentId,
            userId: r.userId,
            firstName: r.firstName,
            lastName: r.lastName,
            email: r.email,
            role: r.role,
            assignedAt: r.assignedAt,
        }));
    }
    async assignStaff(branchId, userId) {
        const branch = await this.branchRepo.findOne({ where: { id: branchId, deletedAt: (0, typeorm_2.IsNull)() } });
        if (!branch)
            throw new common_1.NotFoundException('Branch not found');
        const user = await this.userRepo.findOne({ where: { id: userId, deletedAt: (0, typeorm_2.IsNull)() } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (user.role === user_entity_1.UserRole.CUSTOMER) {
            throw new common_1.ConflictException('Customers cannot be assigned to branches');
        }
        const existing = await this.userBranchRepo.findOne({
            where: { branchId, userId, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (existing)
            return existing;
        const assignment = this.userBranchRepo.create({ branchId, userId });
        return this.userBranchRepo.save(assignment);
    }
    async unassignStaff(branchId, userId) {
        const assignment = await this.userBranchRepo.findOne({
            where: { branchId, userId, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (!assignment)
            throw new common_1.NotFoundException('Assignment not found');
        const now = new Date();
        await this.userBranchRepo.update({ id: assignment.id }, { deletedAt: now });
        return { deletedAt: now };
    }
    async assertCodeAvailable(code) {
        const existing = await this.branchRepo.findOne({
            where: { code, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (existing) {
            throw new common_1.ConflictException(`Branch code "${code}" is already in use`);
        }
    }
    async assertWarehouseCodeAvailable(warehouseCode) {
        const existing = await this.branchRepo.findOne({
            where: { warehouseCode, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (existing) {
            throw new common_1.ConflictException(`warehouseCode "${warehouseCode}" is already in use by another branch`);
        }
    }
    async assertTerminalCodeAvailable(code) {
        const existing = await this.terminalRepo.findOne({
            where: { code, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (existing) {
            throw new common_1.ConflictException(`Terminal code "${code}" is already in use`);
        }
    }
    async assertNotLastActive(branchId) {
        const otherActive = await this.branchRepo
            .createQueryBuilder('b')
            .where('b.id != :id', { id: branchId })
            .andWhere('b."deletedAt" IS NULL')
            .andWhere('b."isActive" = true')
            .getCount();
        if (otherActive === 0) {
            throw new common_1.ConflictException({
                error: 'BRANCH_HAS_DEPENDENCIES',
                message: 'Cannot remove the last active branch. Create another branch first.',
                blockers: { isLastActiveBranch: true },
            });
        }
    }
    async assertNoBlockingDependencies(branch) {
        const blockers = {};
        const activeTerminals = await this.terminalRepo
            .createQueryBuilder('t')
            .where('t."branchId" = :branchId', { branchId: branch.id })
            .andWhere('t."deletedAt" IS NULL')
            .andWhere('t."isActive" = true')
            .getCount();
        if (activeTerminals > 0)
            blockers.activeTerminals = activeTerminals;
        const stockRows = await this.dataSource.query(`SELECT COALESCE(SUM("onHand"), 0)::text AS total
         FROM "stock_levels"
        WHERE "warehouseCode" = $1`, [branch.warehouseCode]);
        const stockOnHand = Number(stockRows[0]?.total ?? '0');
        if (stockOnHand > 0)
            blockers.stockOnHand = stockOnHand;
        const sessionsTableExists = await this.tableExists('pos_sessions');
        if (sessionsTableExists) {
            const sessionRows = await this.dataSource.query(`SELECT COUNT(*)::text AS count
           FROM "pos_sessions" ps
           INNER JOIN "terminals" t ON t.id = ps."terminalId"
          WHERE t."branchId" = $1
            AND ps.status IN ('ACTIVE', 'AWAITING_PAYMENT')`, [branch.id]);
            const activeSessions = Number(sessionRows[0]?.count ?? '0');
            if (activeSessions > 0)
                blockers.activeSessions = activeSessions;
        }
        const ordersHasBranchId = await this.columnExists('orders', 'branchId');
        if (ordersHasBranchId) {
            const orderRows = await this.dataSource.query(`SELECT COUNT(*)::text AS count
           FROM "orders"
          WHERE "branchId" = $1
            AND status IN ('PENDING_PAYMENT', 'PAID', 'PROCESSING')`, [branch.id]);
            const openOrders = Number(orderRows[0]?.count ?? '0');
            if (openOrders > 0)
                blockers.openOrders = openOrders;
        }
        if (Object.keys(blockers).length > 0) {
            throw new common_1.ConflictException({
                error: 'BRANCH_HAS_DEPENDENCIES',
                message: 'This branch has dependent records. Resolve them before deleting.',
                blockers,
            });
        }
    }
    async assertNoActiveSessionForTerminal(terminalId) {
        const sessionsTableExists = await this.tableExists('pos_sessions');
        if (!sessionsTableExists)
            return;
        const rows = await this.dataSource.query(`SELECT COUNT(*)::text AS count
         FROM "pos_sessions"
        WHERE "terminalId" = $1
          AND status IN ('ACTIVE', 'AWAITING_PAYMENT')`, [terminalId]);
        const activeSessions = Number(rows[0]?.count ?? '0');
        if (activeSessions > 0) {
            throw new common_1.ConflictException({
                error: 'TERMINAL_HAS_ACTIVE_SESSION',
                message: 'Close the active POS session before deleting the terminal.',
                blockers: { activeSessions },
            });
        }
    }
    async tableExists(tableName) {
        const rows = await this.dataSource.query(`SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
       ) AS exists`, [tableName]);
        return rows[0]?.exists === true;
    }
    async columnExists(tableName, columnName) {
        const rows = await this.dataSource.query(`SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
       ) AS exists`, [tableName, columnName]);
        return rows[0]?.exists === true;
    }
};
exports.BranchesService = BranchesService;
exports.BranchesService = BranchesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(branch_entity_1.Branch)),
    __param(1, (0, typeorm_1.InjectRepository)(terminal_entity_1.Terminal)),
    __param(2, (0, typeorm_1.InjectRepository)(user_branch_entity_1.UserBranch)),
    __param(3, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource])
], BranchesService);
//# sourceMappingURL=branches.service.js.map