import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Branch } from './entities/branch.entity';
import { Terminal } from './entities/terminal.entity';
import { UserBranch } from './entities/user-branch.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';
import { CreateTerminalDto, UpdateTerminalDto } from './dto/terminal.dto';

/**
 * BranchesService — owns the lifecycle of branches, terminals, and staff
 * assignments. Soft-delete is the only deletion path (regulatory: business
 * records must remain auditable). Every "delete" operation runs a set of
 * guards before flipping `deletedAt`.
 *
 * Roles & visibility:
 *   - SUPER_ADMIN, COMPANY_SUPER_ADMIN  → see all (active) branches
 *   - COMPANY_STAFF                     → see only branches they're assigned to
 *   - CUSTOMER                          → no access (enforced at controller)
 */
@Injectable()
export class BranchesService {
  constructor(
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
    @InjectRepository(Terminal) private readonly terminalRepo: Repository<Terminal>,
    @InjectRepository(UserBranch) private readonly userBranchRepo: Repository<UserBranch>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // BRANCHES
  // ─────────────────────────────────────────────────────────────

  /**
   * List branches visible to the caller.
   *  - SUPER_ADMIN / COMPANY_SUPER_ADMIN  → all non-deleted branches
   *  - COMPANY_STAFF                      → only those they're assigned to
   */
  async listForUser(user: { id: string; role: UserRole }): Promise<Branch[]> {
    const isPrivileged =
      user.role === UserRole.SUPER_ADMIN || user.role === UserRole.COMPANY_SUPER_ADMIN;

    if (isPrivileged) {
      return this.branchRepo.find({
        where: { deletedAt: IsNull() },
        order: { createdAt: 'ASC' },
      });
    }

    // COMPANY_STAFF: scope by user_branches.
    const rows = await this.userBranchRepo
      .createQueryBuilder('ub')
      .innerJoin('branches', 'b', 'b.id = ub.branchId AND b."deletedAt" IS NULL')
      .where('ub.userId = :userId', { userId: user.id })
      .andWhere('ub."deletedAt" IS NULL')
      .select(['ub.branchId AS "branchId"'])
      .getRawMany<{ branchId: string }>();

    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.branchId);
    return this.branchRepo.find({
      where: ids.map((id) => ({ id, deletedAt: IsNull() })),
      order: { createdAt: 'ASC' },
    });
  }

  async getByIdForUser(id: string, user: { id: string; role: UserRole }): Promise<Branch> {
    const branch = await this.branchRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!branch) throw new NotFoundException('Branch not found');

    const isPrivileged =
      user.role === UserRole.SUPER_ADMIN || user.role === UserRole.COMPANY_SUPER_ADMIN;
    if (isPrivileged) return branch;

    // COMPANY_STAFF must be assigned.
    const assignment = await this.userBranchRepo.findOne({
      where: { branchId: id, userId: user.id, deletedAt: IsNull() },
    });
    if (!assignment) {
      throw new ForbiddenException('Not assigned to this branch');
    }
    return branch;
  }

  async create(dto: CreateBranchDto): Promise<Branch> {
    const code = dto.code.toUpperCase();
    const warehouseCode = dto.warehouseCode.toUpperCase();

    // Active uniqueness checks. The DB also enforces these via partial unique
    // indexes, but pre-flighting gives a clean error message.
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

  /**
   * Update branch attributes. `code` and `warehouseCode` are intentionally
   * NOT in the DTO — but we double-defend at the service layer in case a
   * caller smuggles them through.
   */
  async update(id: string, dto: UpdateBranchDto): Promise<Branch> {
    // Defence in depth: reject any attempt to change immutable fields.
    if ('code' in (dto as object) || 'warehouseCode' in (dto as object)) {
      throw new ConflictException('code and warehouseCode are immutable');
    }

    const branch = await this.branchRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!branch) throw new NotFoundException('Branch not found');

    if (dto.name !== undefined) branch.name = dto.name;
    if (dto.address !== undefined) branch.address = dto.address;
    if (dto.phone !== undefined) branch.phone = dto.phone;
    if (dto.isActive !== undefined) {
      // If we're DEACTIVATING the branch, run the same dependency guards we
      // would for delete. Deactivation is functionally a soft-stop:
      // operations cease but the row remains for reporting.
      if (branch.isActive && dto.isActive === false) {
        await this.assertNoBlockingDependencies(branch);
        await this.assertNotLastActive(branch.id);
      }
      branch.isActive = dto.isActive;
    }

    return this.branchRepo.save(branch);
  }

  /**
   * Soft-delete a branch. Cascades soft-delete to its terminals and staff
   * assignments in a single transaction. Returns 409 with a structured
   * payload if any guard fails.
   */
  async softDelete(id: string): Promise<{ deletedAt: Date }> {
    const branch = await this.branchRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!branch) throw new NotFoundException('Branch not found');

    await this.assertNotLastActive(branch.id);
    await this.assertNoBlockingDependencies(branch);

    const now = new Date();

    await this.dataSource.transaction(async (em) => {
      // Soft-delete the branch first.
      await em
        .createQueryBuilder()
        .update(Branch)
        .set({ deletedAt: now, isActive: false })
        .where('id = :id AND "deletedAt" IS NULL', { id: branch.id })
        .execute();

      // Cascade soft-delete to terminals.
      await em
        .createQueryBuilder()
        .update(Terminal)
        .set({ deletedAt: now, isActive: false })
        .where('"branchId" = :branchId AND "deletedAt" IS NULL', { branchId: branch.id })
        .execute();

      // Cascade soft-delete to staff assignments.
      await em
        .createQueryBuilder()
        .update(UserBranch)
        .set({ deletedAt: now })
        .where('"branchId" = :branchId AND "deletedAt" IS NULL', { branchId: branch.id })
        .execute();
    });

    return { deletedAt: now };
  }

  // ─────────────────────────────────────────────────────────────
  // TERMINALS
  // ─────────────────────────────────────────────────────────────

  async listTerminals(
    branchId: string,
    user: { id: string; role: UserRole },
  ): Promise<Terminal[]> {
    // Verifies branch exists AND user has access.
    await this.getByIdForUser(branchId, user);
    return this.terminalRepo.find({
      where: { branchId, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
  }

  async createTerminal(branchId: string, dto: CreateTerminalDto): Promise<Terminal> {
    const branch = await this.branchRepo.findOne({ where: { id: branchId, deletedAt: IsNull() } });
    if (!branch) throw new NotFoundException('Branch not found');
    if (!branch.isActive) {
      throw new ConflictException('Cannot add terminal to an inactive branch');
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

  async updateTerminal(
    branchId: string,
    terminalId: string,
    dto: UpdateTerminalDto,
  ): Promise<Terminal> {
    if ('code' in (dto as object)) {
      throw new ConflictException('terminal code is immutable');
    }

    const terminal = await this.terminalRepo.findOne({
      where: { id: terminalId, branchId, deletedAt: IsNull() },
    });
    if (!terminal) throw new NotFoundException('Terminal not found');

    if (dto.name !== undefined) terminal.name = dto.name;
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

  async softDeleteTerminal(branchId: string, terminalId: string): Promise<{ deletedAt: Date }> {
    const terminal = await this.terminalRepo.findOne({
      where: { id: terminalId, branchId, deletedAt: IsNull() },
    });
    if (!terminal) throw new NotFoundException('Terminal not found');

    await this.assertNoActiveSessionForTerminal(terminal.id);

    const now = new Date();
    await this.terminalRepo.update(
      { id: terminal.id },
      { deletedAt: now, isActive: false },
    );
    return { deletedAt: now };
  }

  // ─────────────────────────────────────────────────────────────
  // STAFF ASSIGNMENTS
  // ─────────────────────────────────────────────────────────────

  /**
   * List staff currently assigned to a branch. Returns lightweight user
   * details suitable for an admin "assigned members" panel.
   */
  async listStaff(branchId: string): Promise<
    Array<{
      assignmentId: string;
      userId: string;
      firstName: string;
      lastName: string;
      email: string;
      role: UserRole;
      assignedAt: Date;
    }>
  > {
    const branch = await this.branchRepo.findOne({
      where: { id: branchId, deletedAt: IsNull() },
    });
    if (!branch) throw new NotFoundException('Branch not found');

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
      role: r.role as UserRole,
      assignedAt: r.assignedAt,
    }));
  }

  async assignStaff(branchId: string, userId: string): Promise<UserBranch> {
    const branch = await this.branchRepo.findOne({ where: { id: branchId, deletedAt: IsNull() } });
    if (!branch) throw new NotFoundException('Branch not found');

    const user = await this.userRepo.findOne({ where: { id: userId, deletedAt: IsNull() } });
    if (!user) throw new NotFoundException('User not found');

    if (user.role === UserRole.CUSTOMER) {
      throw new ConflictException('Customers cannot be assigned to branches');
    }

    // If an active assignment already exists, return it (idempotent).
    const existing = await this.userBranchRepo.findOne({
      where: { branchId, userId, deletedAt: IsNull() },
    });
    if (existing) return existing;

    const assignment = this.userBranchRepo.create({ branchId, userId });
    return this.userBranchRepo.save(assignment);
  }

  async unassignStaff(branchId: string, userId: string): Promise<{ deletedAt: Date }> {
    const assignment = await this.userBranchRepo.findOne({
      where: { branchId, userId, deletedAt: IsNull() },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    const now = new Date();
    await this.userBranchRepo.update({ id: assignment.id }, { deletedAt: now });
    return { deletedAt: now };
  }

  // ─────────────────────────────────────────────────────────────
  // GUARDS
  // ─────────────────────────────────────────────────────────────

  /** Code uniqueness, only across active (non-deleted) rows. */
  private async assertCodeAvailable(code: string): Promise<void> {
    const existing = await this.branchRepo.findOne({
      where: { code, deletedAt: IsNull() },
    });
    if (existing) {
      throw new ConflictException(`Branch code "${code}" is already in use`);
    }
  }

  private async assertWarehouseCodeAvailable(warehouseCode: string): Promise<void> {
    const existing = await this.branchRepo.findOne({
      where: { warehouseCode, deletedAt: IsNull() },
    });
    if (existing) {
      throw new ConflictException(`warehouseCode "${warehouseCode}" is already in use by another branch`);
    }
  }

  private async assertTerminalCodeAvailable(code: string): Promise<void> {
    const existing = await this.terminalRepo.findOne({
      where: { code, deletedAt: IsNull() },
    });
    if (existing) {
      throw new ConflictException(`Terminal code "${code}" is already in use`);
    }
  }

  /** Refuse to deactivate / delete the last remaining active branch. */
  private async assertNotLastActive(branchId: string): Promise<void> {
    const otherActive = await this.branchRepo
      .createQueryBuilder('b')
      .where('b.id != :id', { id: branchId })
      .andWhere('b."deletedAt" IS NULL')
      .andWhere('b."isActive" = true')
      .getCount();

    if (otherActive === 0) {
      throw new ConflictException({
        error: 'BRANCH_HAS_DEPENDENCIES',
        message: 'Cannot remove the last active branch. Create another branch first.',
        blockers: { isLastActiveBranch: true },
      });
    }
  }

  /**
   * Block deletion if dependencies exist:
   *  - active terminals
   *  - non-zero stock at the branch's warehouse
   *  - active POS sessions on its terminals (only checked once that table
   *    exists; introduced by PR #11 per SCANNER_APP_PLAN.md)
   *
   * The pos_sessions / orders.branchId checks are run defensively via
   * information_schema lookups so this code works correctly today AND
   * tomorrow when those columns land — no future code change required.
   */
  private async assertNoBlockingDependencies(branch: Branch): Promise<void> {
    const blockers: Record<string, number | boolean> = {};

    // 1. Active terminals.
    const activeTerminals = await this.terminalRepo
      .createQueryBuilder('t')
      .where('t."branchId" = :branchId', { branchId: branch.id })
      .andWhere('t."deletedAt" IS NULL')
      .andWhere('t."isActive" = true')
      .getCount();
    if (activeTerminals > 0) blockers.activeTerminals = activeTerminals;

    // 2. Non-zero stock at the warehouse.
    const stockRows = await this.dataSource.query<Array<{ total: string }>>(
      `SELECT COALESCE(SUM("onHand"), 0)::text AS total
         FROM "stock_levels"
        WHERE "warehouseCode" = $1`,
      [branch.warehouseCode],
    );
    const stockOnHand = Number(stockRows[0]?.total ?? '0');
    if (stockOnHand > 0) blockers.stockOnHand = stockOnHand;

    // 3. Active POS sessions on this branch's terminals — defensive check
    //    for when pos_sessions lands.
    const sessionsTableExists = await this.tableExists('pos_sessions');
    if (sessionsTableExists) {
      const sessionRows = await this.dataSource.query<Array<{ count: string }>>(
        `SELECT COUNT(*)::text AS count
           FROM "pos_sessions" ps
           INNER JOIN "terminals" t ON t.id = ps."terminalId"
          WHERE t."branchId" = $1
            AND ps.status IN ('ACTIVE', 'AWAITING_PAYMENT')`,
        [branch.id],
      );
      const activeSessions = Number(sessionRows[0]?.count ?? '0');
      if (activeSessions > 0) blockers.activeSessions = activeSessions;
    }

    // 4. Open orders at this branch — defensive check for when
    //    orders.branchId lands (introduced alongside pos-sessions).
    const ordersHasBranchId = await this.columnExists('orders', 'branchId');
    if (ordersHasBranchId) {
      const orderRows = await this.dataSource.query<Array<{ count: string }>>(
        `SELECT COUNT(*)::text AS count
           FROM "orders"
          WHERE "branchId" = $1
            AND status IN ('PENDING_PAYMENT', 'PAID', 'PROCESSING')`,
        [branch.id],
      );
      const openOrders = Number(orderRows[0]?.count ?? '0');
      if (openOrders > 0) blockers.openOrders = openOrders;
    }

    if (Object.keys(blockers).length > 0) {
      throw new ConflictException({
        error: 'BRANCH_HAS_DEPENDENCIES',
        message: 'This branch has dependent records. Resolve them before deleting.',
        blockers,
      });
    }
  }

  /**
   * Block terminal deletion / deactivation if a session is currently open.
   * Defensive against pos_sessions not yet existing.
   */
  private async assertNoActiveSessionForTerminal(terminalId: string): Promise<void> {
    const sessionsTableExists = await this.tableExists('pos_sessions');
    if (!sessionsTableExists) return;

    const rows = await this.dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count
         FROM "pos_sessions"
        WHERE "terminalId" = $1
          AND status IN ('ACTIVE', 'AWAITING_PAYMENT')`,
      [terminalId],
    );
    const activeSessions = Number(rows[0]?.count ?? '0');
    if (activeSessions > 0) {
      throw new ConflictException({
        error: 'TERMINAL_HAS_ACTIVE_SESSION',
        message: 'Close the active POS session before deleting the terminal.',
        blockers: { activeSessions },
      });
    }
  }

  /** Helper: check whether a public table exists. */
  private async tableExists(tableName: string): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
       ) AS exists`,
      [tableName],
    );
    return rows[0]?.exists === true;
  }

  /** Helper: check whether a column exists on a table. */
  private async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
       ) AS exists`,
      [tableName, columnName],
    );
    return rows[0]?.exists === true;
  }
}
