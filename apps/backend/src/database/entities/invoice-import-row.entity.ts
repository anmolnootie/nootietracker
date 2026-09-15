import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { InvoiceUploadBatchEntity } from './invoice-upload-batch.entity';

@Entity('invoice_import_rows')
export class InvoiceImportRowEntity {
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

  @Column({ type: 'timestamp', nullable: true })
  invoiceDate: Date | null;

  @Column({ type: 'varchar', nullable: true })
  awbNumber: string | null;

  @Column({ type: 'enum', enum: ['MATCHED', 'PO_NOT_FOUND', 'NO_DISPATCH_RECORD', 'INVALID'] })
  matchStatus: 'MATCHED' | 'PO_NOT_FOUND' | 'NO_DISPATCH_RECORD' | 'INVALID';

  @Column({ type: 'uuid', nullable: true })
  matchedPoId: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => InvoiceUploadBatchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batchId' })
  batch: InvoiceUploadBatchEntity;
}
