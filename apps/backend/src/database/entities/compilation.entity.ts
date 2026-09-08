import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * A named, saved selection of POs for reporting/output - stores references
 * (poIds) only, never copies of PO data, so a compilation always reflects the
 * PO Master's current state when viewed, even if those POs change later.
 */
@Entity('compilations')
export class CompilationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  compilationCode: string;

  @Column({ nullable: true })
  name: string;

  @Column('uuid')
  createdByUserId: string;

  @Column({ type: 'timestamp', nullable: true })
  periodStart: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  periodEnd: Date | null;

  @Column('jsonb', { default: () => "'{}'" })
  filters: Record<string, any>;

  @Column('jsonb', { default: () => "'[]'" })
  poIds: string[];

  @CreateDateColumn()
  createdAt: Date;
}
