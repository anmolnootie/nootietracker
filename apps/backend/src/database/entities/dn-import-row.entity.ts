import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DnUploadBatchEntity } from './dn-upload-batch.entity';

/**
 * One line item from a vendor Debit Note (DN) export - damage/shortage/
 * excess-quantity line items raised against a purchase. Columns mirror
 * that export 1:1; this is a flat store-and-browse record (same v1 scope
 * as prn-import), not matched against POs/returns.
 */
@Entity('dn_import_rows')
export class DnImportRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  batchId: string;

  @Column({ type: 'int' })
  rowIndex: number;

  @Column({ type: 'varchar', nullable: true })
  facilityName: string | null;

  @Column({ type: 'varchar', nullable: true })
  dnId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  dnDate: Date | null;

  @Column({ type: 'varchar', nullable: true })
  vendorName: string | null;

  @Column({ type: 'varchar', nullable: true })
  vendorGstin: string | null;

  @Column({ type: 'varchar', nullable: true })
  purchaseNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  manufacturer: string | null;

  @Column({ type: 'varchar', nullable: true })
  invoiceId: string | null;

  @Column({ type: 'varchar', nullable: true })
  itemId: string | null;

  @Column({ type: 'varchar', nullable: true })
  productName: string | null;

  @Column({ type: 'varchar', nullable: true })
  upcId: string | null;

  @Column({ type: 'int', nullable: true })
  dnQuantity: number | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  unitLandingPrice: number | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  itemDnAmount: number | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  dnNetAmount: number | null;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => DnUploadBatchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batchId' })
  batch: DnUploadBatchEntity;
}
