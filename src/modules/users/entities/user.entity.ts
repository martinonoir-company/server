import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  COMPANY_SUPER_ADMIN = 'COMPANY_SUPER_ADMIN',
  COMPANY_STAFF = 'COMPANY_STAFF',
  CUSTOMER = 'CUSTOMER',
}

@Entity('users')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ type: 'varchar', length: 100 })
  lastName!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone?: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CUSTOMER })
  role!: UserRole;

  @Column({ type: 'varchar', length: 3, default: 'NG' })
  countryCode!: string;

  @Column({ type: 'enum', enum: ['NGN', 'USD'], default: 'NGN' })
  preferredCurrency!: 'NGN' | 'USD';

  @Column({ type: 'boolean', default: false })
  emailVerified!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  totpSecret?: string;

  @Column({ type: 'boolean', default: false })
  twoFactorEnabled!: boolean;

  @Column({ type: 'varchar', array: true, nullable: true, select: false })
  backupCodes?: string[];

  @Column({ type: 'int', default: 0 })
  failedLoginAttempts!: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt?: Date;

  @Column({ type: 'varchar', length: 512, nullable: true })
  avatarUrl?: string;

  @Column({ type: 'simple-array', nullable: true })
  permissions?: string[];

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}
