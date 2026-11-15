import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { POMasterEntity } from './po-master.entity';

/**
 * Control Tower team entry fields, one row per PO (created on first edit).
 * None of these exist elsewhere: the Warehouse Master has no E-way column, and
 * the printout/handover/ack trail is only ever typed in by the team.
 * Day fields are plain dates (IST calendar days), not timestamps.
 */
@Entity('po_tracking')
export class POTrackingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  poId: string;

  @OneToOne(() => POMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poId' })
  po: POMasterEntity;

  /** Pending | Accepted | Declined | Cancelled | Expired - overrides the inferred decision when set. */
  @Column({ type: 'varchar', nullable: true })
  decision: string | null;

  @Column({ type: 'varchar', nullable: true })
  decisionReason: string | null;

  @Column({ type: 'date', nullable: true })
  printoutReceivedOn: string | null;

  @Column({ type: 'date', nullable: true })
  handedOn: string | null;

  /** The person the printout was handed to. */
  @Column({ type: 'varchar', nullable: true })
  handedTo: string | null;

  @Column({ type: 'date', nullable: true })
  ackOn: string | null;

  @Column({ type: 'varchar', nullable: true })
  ackBy: string | null;

  @Column({ type: 'varchar', nullable: true })
  owner: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ type: 'varchar', nullable: true })
  ewayBillNo: string | null;

  @Column({ type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
