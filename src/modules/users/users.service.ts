import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UpdateProfileDto, ChangePasswordDto } from './dto/account.dto';
import * as argon2 from 'argon2';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  /**
   * Find user with password hash for auth verification.
   */
  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  /**
   * Get public profile (strips sensitive fields).
   */
  async getProfile(userId: string): Promise<Record<string, unknown>> {
    const user = await this.findById(userId);
    return this.sanitizeUser(user);
  }

  /**
   * Update profile fields (not password).
   */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<Record<string, unknown>> {
    const user = await this.findById(userId);

    if (dto.firstName) user.firstName = dto.firstName;
    if (dto.lastName) user.lastName = dto.lastName;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.countryCode) user.countryCode = dto.countryCode;

    const saved = await this.userRepo.save(user);
    return this.sanitizeUser(saved);
  }

  /**
   * Change password — requires current password verification.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) throw new NotFoundException('User not found');

    // Verify current password
    const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash new password
    user.passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await this.userRepo.save(user);
  }

  /**
   * Remove sensitive fields from user object.
   */
  private sanitizeUser(user: User): Record<string, unknown> {
    const {
      passwordHash: _pw,
      totpSecret: _ts,
      backupCodes: _bc,
      failedLoginAttempts: _fla,
      lockedUntil: _lu,
      ...profile
    } = user as unknown as Record<string, unknown>;
    return profile;
  }
}
