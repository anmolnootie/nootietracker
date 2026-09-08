import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * Deliberately has no FK/relation to POMasterEntity - it must survive the
 * permanent deletion of the PO row it describes, so it stores a plain
 * poNumber string snapshot instead of a poId reference.
 */
@Entity('po_deletion_audit')
export class PODeletionAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  poNumber: string;

  @Column({ type: 'uuid' })
  deletedByUserId: string;

  @Column({ type: 'timestamp' })
  deletedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  permanentlyDeletedByUserId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  permanentlyDeletedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
