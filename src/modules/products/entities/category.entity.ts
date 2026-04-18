import { Entity, Column, Index, Tree, TreeChildren, TreeParent, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base.entity';

@Entity('categories')
@Tree('materialized-path')
export class Category extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 250 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  /** Alternative name for this category (e.g., "Sling Bags" for "Crossbody Bags") */
  @Column({ type: 'varchar', length: 200, nullable: true })
  alias?: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  imageUrl?: string;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', length: 200, nullable: true })
  metaTitle?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  metaDescription?: string;

  @TreeChildren()
  children!: Category[];

  @TreeParent()
  parent?: Category;
}
