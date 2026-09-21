import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('sheet_tracker_upload_batches')
export class SheetTrackerUploadBatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  batchCode: string;

  @Column()
  fileName: string;

  // null = an automatic sync (Google Sheet), not a person's upload
  @Column({ type: 'uuid', nullable: true })
  uploadedByUserId: string | null;

  // Hash of the rows an automatic sync received, so an unchanged sheet
  // doesn't create a new batch every interval
  @Column({ type: 'varchar', nullable: true })
  payloadHash: string | null;

  @CreateDateColumn()
  uploadedAt: Date;

  @Column({ type: 'enum', enum: ['PROCESSING', 'COMPLETED', 'FAILED'], default: 'PROCESSING' })
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';

  @Column({ type: 'int', default: 0 })
  totalRows: number;

  @Column({ type: 'int', default: 0 })
  appliedCount: number;

  @Column({ type: 'int', default: 0 })
  skippedCount: number;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
