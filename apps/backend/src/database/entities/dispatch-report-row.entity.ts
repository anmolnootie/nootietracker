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

  @Column({ type: 'varchar', nullable: true })
  poNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  invoiceNumber: string | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  invoiceValue: number | null;

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
