import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, ILike } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { AuthService } from '../auth/auth.service';
import { CreateStaffDto, UpdateStaffRoleDto, ListStaffQueryDto } from './dto/staff.dto';

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly authService: AuthService,
  ) {}

  /**
   * List all staff members (non-customer users).
   * Paginates and supports search + role filter.
   */
  async listStaff(query: ListStaffQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.userRepo
      .createQueryBuilder('user')
      .where('user.role != :customer', { customer: UserRole.CUSTOMER })
      .orderBy('user.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.search) {
      const q = `%${query.search}%`;
      qb.andWhere(
        '(user.firstName ILIKE :q OR user.lastName ILIKE :q OR user.email ILIKE :q)',
        { q },
      );
    }

    if (query.role) {
      qb.andWhere('user.role = :role', { role: query.role });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map(this.sanitize),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single staff member by ID.
   */
  async getStaff(id: string) {
    const user = await this.userRepo.findOne({
      where: { id },
    });
    if (!user || user.role === UserRole.CUSTOMER) {
      throw new NotFoundException('Staff member not found');
    }
    return this.sanitize(user);
  }

  /**
   * Create a new staff account and send invitation email.
   */
  async createStaff(dto: CreateStaffDto, inviter: User): Promise<ReturnType<typeof this.sanitize>> {
    const inviterName = `${inviter.firstName} ${inviter.lastName}`;
    const user = await this.authService.createStaffAccount(
      {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        role: dto.role,
      },
      inviterName,
    );
    return this.sanitize(user);
  }

  /**
   * Update a staff member's role.
   * Cannot change a SUPER_ADMIN's role.
   */
  async updateRole(id: string, dto: UpdateStaffRoleDto, requestingUser: User) {
    const target = await this.userRepo.findOne({ where: { id } });
    if (!target || target.role === UserRole.CUSTOMER) {
      throw new NotFoundException('Staff member not found');
    }
    if (target.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot change a SUPER_ADMIN role');
    }
    if (target.id === requestingUser.id) {
      throw new BadRequestException('You cannot change your own role');
    }

    await this.userRepo.update(id, { role: dto.role });
    return this.sanitize({ ...target, role: dto.role });
  }

  /**
   * Deactivate (soft-delete) a staff account.
   */
  async deactivateStaff(id: string, requestingUser: User): Promise<void> {
    const target = await this.userRepo.findOne({ where: { id } });
    if (!target || target.role === UserRole.CUSTOMER) {
      throw new NotFoundException('Staff member not found');
    }
    if (target.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot deactivate a SUPER_ADMIN');
    }
    if (target.id === requestingUser.id) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    await this.userRepo.softDelete(id);
    // Revoke all sessions
    await this.authService.logoutAll(id);
  }

  /**
   * Reactivate a previously deactivated staff account.
   */
  async reactivateStaff(id: string): Promise<ReturnType<typeof this.sanitize>> {
    const target = await this.userRepo.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!target) throw new NotFoundException('Staff member not found');
    if (!target.deletedAt) throw new BadRequestException('Account is not deactivated');

    await this.userRepo.restore(id);
    return this.sanitize({ ...target, deletedAt: undefined });
  }

  private sanitize(user: Partial<User>) {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      phone: user.phone,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      isActive: !user.deletedAt,
    };
  }
}
