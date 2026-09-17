import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { GrnUploadBatchEntity } from './grn-upload-batch.entity';

@Entity('grn_import_rows')
export class GrnImportRowEntity {
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
  grnNumber: string | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  grnValue: number | null;

  @Column({ type: 'varchar', nullable: true })
  outcome: string | null;

  @Column({ type: 'text', nullable: true })
  discrepancyReason: string | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  discrepancyAmount: number | null;

  @Column({ type: 'enum', enum: ['MATCHED', 'PO_NOT_FOUND', 'INVALID'] })
  matchStatus: 'MATCHED' | 'PO_NOT_FOUND' | 'INVALID';

  @Column({ type: 'uuid', nullable: true })
  matchedPoId: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => GrnUploadBatchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batchId' })
  batch: GrnUploadBatchEntity;
}
