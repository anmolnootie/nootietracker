import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DispatchReportUploadBatchEntity } from './dispatch-report-upload-batch.entity';

/**
 * Reconciliation is purely a comparison against what's already in the
 * system - this row never writes to DispatchEntity itself (that's Invoice
 * Bulk Upload's job). MISMATCH is the actual alarm case: an invoice number
 * the channel's report says was dispatched, that this system has no record
 * of at all.
 */
@Entity('dispatch_report_rows')
export class DispatchReportRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  batchId: string;

  @Column({ type: 'int' })
  rowIndex: number;

  // The channel's own dispatch reports arrive as one multi-channel file
  // (party name is a per-row column, not a whole-file upload choice) -
  // captured here for display/audit, not used in the match logic itself.
  @Column({ type: 'varchar', nullable: true })
  partyName: string | null;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  @Column({ type: 'varchar', nullable: true })
  poNumber: string | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  poValue: number | null;

  @Column({ type: 'varchar', nullable: true })
  invoiceNumber: string | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  invoiceValue: number | null;

  // The channel's own computed fill rate, as reported in the file - kept as
  // a reference figure alongside our own po.fillRatePercent, not compared
  // against it (reconciliation here is invoice-presence only, per spec).
  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  reportedFillRatePercent: number | null;

  @Column({ type: 'enum', enum: ['RECONCILED', 'MISMATCH', 'INVALID'] })
  matchStatus: 'RECONCILED' | 'MISMATCH' | 'INVALID';

  @Column({ type: 'uuid', nullable: true })
  matchedPoId: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => DispatchReportUploadBatchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batchId' })
  batch: DispatchReportUploadBatchEntity;
}
