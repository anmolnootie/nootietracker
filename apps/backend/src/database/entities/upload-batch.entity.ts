import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { UploadBatchStatus } from '@po-control-tower/shared';

@Entity('upload_batches')
export class UploadBatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  batchCode: string;

  @Column()
  fileName: string;

  @Column()
  platform: string;

  @Column('uuid')
  uploadedByUserId: string;

  @CreateDateColumn()
  uploadedAt: Date;

  @Column({ type: 'enum', enum: UploadBatchStatus, default: UploadBatchStatus.UPLOADING })
  status: UploadBatchStatus;

  @Column({ type: 'int', default: 0 })
  totalRows: number;

  @Column({ type: 'int', default: 0 })
  poCount: number;

  @Column({ type: 'int', default: 0 })
  skuCount: number;

  @Column({ type: 'timestamp', nullable: true })
  dateRangeStart: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  dateRangeEnd: Date | null;

  @Column({ type: 'int', default: 0 })
  newRecords: number;

  @Column({ type: 'int', default: 0 })
  updatedRecords: number;

  @Column({ type: 'int', default: 0 })
  duplicateRecords: number;

  @Column({ type: 'int', default: 0 })
  exceptionRecords: number;

  @Column({ type: 'int', default: 0 })
  failedRecords: number;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  // Path to the untouched original file on disk - RAW data is never overwritten.
  @Column({ nullable: true })
  rawFileStoragePath: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
