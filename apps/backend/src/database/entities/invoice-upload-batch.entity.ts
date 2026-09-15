import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('invoice_upload_batches')
export class InvoiceUploadBatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  batchCode: string;

  @Column()
  fileName: string;

  @Column('uuid')
  uploadedByUserId: string;

  @CreateDateColumn()
  uploadedAt: Date;

  @Column({ type: 'enum', enum: ['PROCESSING', 'COMPLETED', 'FAILED'], default: 'PROCESSING' })
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';

  @Column({ type: 'int', default: 0 })
  totalRows: number;

  @Column({ type: 'int', default: 0 })
  matchedCount: number;

  @Column({ type: 'int', default: 0 })
  unmatchedCount: number;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
