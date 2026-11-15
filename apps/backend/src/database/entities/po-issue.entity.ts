import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { POMasterEntity } from './po-master.entity';

/**
 * Control Tower issues CRM: a problem raised against one PO, assigned, chased
 * and resolved. Types / priorities / statuses are the artifact's lists
 * (ISSUE_TYPES, PRIORITIES, ISSUE_STATUS in control-tower.core.ts), stored as text.
 */
@Entity('po_issues')
export class POIssueEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  poId: string;

  @ManyToOne(() => POMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poId' })
  po: POMasterEntity;

  @Column({ type: 'varchar' })
  issueType: string;

  @Column({ type: 'varchar', default: 'Medium' })
  priority: string;

  /** Open | In progress | Waiting on platform | Resolved */
  @Column({ type: 'varchar', default: 'Open' })
  status: string;

  /** Person responsible, as typed (the team assigns by name, like the artifact). */
  @Column({ type: 'varchar', nullable: true })
  assignee: string | null;

  @Column({ type: 'date', nullable: true })
  nextActionDate: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @Column({ type: 'uuid', nullable: true })
  raisedByUserId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedByUserId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
