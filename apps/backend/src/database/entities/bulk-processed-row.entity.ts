import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DedupClassification } from '@po-control-tower/shared';
import { UploadBatchEntity } from './upload-batch.entity';
import { BulkPORawRowEntity } from './bulk-raw-row.entity';

/**
 * PROCESSED layer - cleaned, column-mapped, and validated version of a raw row,
 * before it's compiled into the PO Master. Kept even after compilation for
 * traceability ("where did this data come from?").
 */
@Entity('bulk_po_processed_rows')
export class BulkPOProcessedRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  batchId: string;

  @Column('uuid')
  rawRowId: string;

  @Column({ nullable: true })
  platform: string;

  @Column({ nullable: true })
  poNumber: string;

  @Column({ type: 'timestamp', nullable: true })
  poDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  appointmentDate: Date;

  @Column({ nullable: true })
  appointmentTime: string;

  @Column({ nullable: true })
  warehouse: string;

  @Column({ nullable: true })
  skuCode: string;

  @Column({ type: 'varchar', nullable: true })
  upc: string | null;

  @Column({ nullable: true })
  productName: string;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  mrp: number | null;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  orderedQty: number;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  acceptedQty: number;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  dispatchedQty: number;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  deliveredQty: number;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  rejectedQty: number;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  pendingQty: number;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  unitPrice: number;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  poValue: number;

  @Column({ nullable: true })
  appointmentStatus: string;

  @Column({ nullable: true })
  deliveryStatus: string;

  @Column({ nullable: true })
  poStatus: string;

  @Column({ type: 'timestamp', nullable: true })
  expiryDate: Date;

  @Column({ type: 'enum', enum: ['VALID', 'INVALID', 'WARNING'], default: 'VALID' })
  validationStatus: 'VALID' | 'INVALID' | 'WARNING';

  @Column('jsonb', { default: () => "'[]'" })
  validationErrors: string[];

  @Column({ type: 'enum', enum: DedupClassification, nullable: true })
  dedupClassification: DedupClassification;

  @Column({ nullable: true, type: 'uuid' })
  matchedPoId: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => UploadBatchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batchId' })
  batch: UploadBatchEntity;

  @ManyToOne(() => BulkPORawRowEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rawRowId' })
  rawRow: BulkPORawRowEntity;
}
