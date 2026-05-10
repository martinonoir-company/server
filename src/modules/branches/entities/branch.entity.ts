import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { Terminal } from './terminal.entity';
import { UserBranch } from './user-branch.entity';

/**
 * A physical store / warehouse location. Inherits soft-delete from BaseEntity
 * (deletedAt). The unique-on-(code) and unique-on-(warehouseCode) constraints
 * are enforced as PARTIAL UNIQUE INDEXES via the migration so a deleted code
 * can be re-issued to a fresh row later.
 *
 * Notes:
 *  - `code` is the human-readable handle used in URLs / admin UI.
 *  - `warehouseCode` is the join key into the inventory tables (stock_levels,
 *    stock_movements). It must be unique across active branches: two
 *    branches sharing one warehouse would create ambiguous "list orders for
 *    this branch" semantics, which we forbid.
 *  - `code` and `warehouseCode` are IMMUTABLE after creation (enforced in
 *    BranchesService.update). Changing either silently breaks historical
 *    audit trails.
 */
@Entity('branches')
export class Branch extends BaseEntity {
  @Index('IDX_branches_code')
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Index('IDX_branches_warehouseCode')
  @Column({ type: 'varchar', length: 100 })
  warehouseCode!: string;

  @Column({ type: 'jsonb', nullable: true })
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    countryCode?: string;
    postalCode?: string;
  } | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone?: string | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => Terminal, (terminal) => terminal.branch)
  terminals?: Terminal[];

  @OneToMany(() => UserBranch, (assignment) => assignment.branch)
  assignments?: UserBranch[];
}
