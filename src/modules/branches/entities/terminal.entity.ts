import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';
import { Branch } from './branch.entity';

/**
 * A POS terminal belonging to a Branch. Every checkout, every POS session,
 * every receipt is rooted here.
 *
 *  - `code` is globally unique across all branches (e.g. "LAGOS-VI-POS-01").
 *  - `code` is IMMUTABLE after creation (historical sales already reference
 *    it). Renaming a terminal would break audit trails.
 *  - Soft-deleted terminals retain their code via a partial unique index in
 *    the migration so historical records keep resolving and the code can be
 *    reissued if needed.
 */
@Entity('terminals')
export class Terminal extends BaseEntity {
  @Index('IDX_terminals_code')
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Index('IDX_terminals_branchId')
  @Column({ type: 'varchar', length: 26 })
  branchId!: string;

  @ManyToOne(() => Branch, (branch) => branch.terminals)
  @JoinColumn({ name: 'branchId' })
  branch?: Branch;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  /**
   * Serial of the physical Moniepoint card terminal paired with this POS
   * terminal. Card payments at this POS are pushed to this device.
   * Nullable — a POS terminal that only takes cash/transfer has none.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  moniepointTerminalSerial?: string | null;
}
