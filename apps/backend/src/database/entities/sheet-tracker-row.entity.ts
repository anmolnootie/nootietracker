import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SheetTrackerUploadBatchEntity } from './sheet-tracker-upload-batch.entity';

/**
 * One row of the "Master Dispatch & GRN Tracker" sheet: what the sheet said,
 * and what applying it to the PO actually did (`actions`).
 */
@Entity('sheet_tracker_rows')
export class SheetTrackerRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  batchId: string;

  @Column({ type: 'int' })
  rowIndex: number;

  @Column({ type: 'varchar', nullable: true })
  poNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  invoiceNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  channel: string | null;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  @Column({ type: 'timestamp', nullable: true })
  dispatchDate: Date | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  invoiceValue: number | null;

  @Column({ type: 'varchar', nullable: true })
  docketAwb: string | null;

  @Column({ type: 'varchar', nullable: true })
  deliveryPartner: string | null;

  @Column({ type: 'varchar', nullable: true })
  deliveryStatus: string | null;

  @Column({ type: 'varchar', nullable: true })
  grnStatus: string | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  shortageValue: number | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  damageValue: number | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  excessValue: number | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  netDiscrepancy: number | null;

  @Column({ type: 'varchar', nullable: true })
  creditNoteNumber: string | null;

  @Column({ type: 'enum', enum: ['APPLIED', 'PO_NOT_FOUND', 'INVALID'] })
  matchStatus: 'APPLIED' | 'PO_NOT_FOUND' | 'INVALID';

  @Column({ type: 'uuid', nullable: true })
  matchedPoId: string | null;

  @Column({ type: 'text', nullable: true })
  actions: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => SheetTrackerUploadBatchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batchId' })
  batch: SheetTrackerUploadBatchEntity;
}
