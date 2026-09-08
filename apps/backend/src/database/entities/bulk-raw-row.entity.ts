import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { UploadBatchEntity } from './upload-batch.entity';

/**
 * RAW layer - the exact, untouched row as read from the uploaded file.
 * Never mutated after insert. Every processed/master record traces back here.
 */
@Entity('bulk_po_raw_rows')
export class BulkPORawRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  batchId: string;

  @Column('int')
  rowIndex: number;

  @Column('jsonb')
  rawData: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => UploadBatchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batchId' })
  batch: UploadBatchEntity;
}
