import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { Branch } from './branch.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Staff <-> Branch assignment.
 *
 * Soft-deletable so we preserve "Staff X was assigned to Branch Y on
 * 2025-08-15" for shift-and-shrinkage investigations.
 *
 * The migration enforces a partial unique index on (userId, branchId)
 * WHERE deletedAt IS NULL so a user can be re-assigned to a branch they
 * were previously removed from.
 */
@Entity('user_branches')
export class UserBranch extends BaseEntity {
  @Index('IDX_user_branches_userId')
  @Column({ type: 'varchar', length: 26 })
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Index('IDX_user_branches_branchId')
  @Column({ type: 'varchar', length: 26 })
  branchId!: string;

  @ManyToOne(() => Branch, (branch) => branch.assignments)
  @JoinColumn({ name: 'branchId' })
  branch?: Branch;
}
