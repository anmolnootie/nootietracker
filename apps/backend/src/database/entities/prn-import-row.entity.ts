import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { PrnUploadBatchEntity } from './prn-upload-batch.entity';

/**
 * One line item from a Purchase Return Note (PRN) export - the
 * quick-commerce partner's (Blink Commerce/Zepto) statement of returns and
 * debit notes against our POs. Columns mirror that export 1:1; this is a
 * flat store-and-browse record, not matched against POs/returns (v1).
 */
@Entity('prn_import_rows')
export class PrnImportRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  batchId: string;

  @Column({ type: 'int' })
  rowIndex: number;

  @Column({ type: 'varchar', nullable: true })
  lookupCategory: string | null;

  @Column({ type: 'varchar', nullable: true })
  fromDispatchedFc: string | null;

  @Column({ type: 'varchar', nullable: true })
  fromDispatchedFacilityName: string | null;

  @Column({ type: 'varchar', nullable: true })
  stoInvoiceId: string | null;

  @Column({ type: 'varchar', nullable: true })
  wmsOrderId: string | null;

  @Column({ type: 'varchar', nullable: true })
  posFacilityId: string | null;

  @Column({ type: 'varchar', nullable: true })
  posFacilityName: string | null;

  @Column({ type: 'varchar', nullable: true })
  gstTin: string | null;

  @Column({ type: 'varchar', nullable: true })
  legalName: string | null;

  @Column({ type: 'varchar', nullable: true })
  merchantId: string | null;

  @Column({ type: 'varchar', nullable: true })
  merchantName: string | null;

  @Column({ type: 'varchar', nullable: true })
  vendorId: string | null;

  @Column({ type: 'varchar', nullable: true })
  vendorName: string | null;

  @Column({ type: 'varchar', nullable: true })
  invoiceId: string | null;

  @Column({ type: 'int', nullable: true })
  invoiceTypeId: number | null;

  @Column({ type: 'varchar', nullable: true })
  invoiceDescription: string | null;

  @Column({ type: 'timestamp', nullable: true })
  posTimestamp: Date | null;

  @Column({ type: 'varchar', nullable: true })
  itemId: string | null;

  @Column({ type: 'varchar', nullable: true })
  manufacturerId: string | null;

  @Column({ type: 'varchar', nullable: true })
  manufacturer: string | null;

  @Column({ type: 'varchar', nullable: true })
  inventoryType: string | null;

  @Column({ type: 'varchar', nullable: true })
  upcId: string | null;

  @Column({ type: 'varchar', nullable: true })
  productName: string | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  mrp: number | null;

  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  landingPrice: number | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  totalTax: number | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  totalCostPrice: number | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  prnValue: number | null;

  @Column({ type: 'varchar', nullable: true })
  merchantInvoiceId: string | null;

  @Column({ type: 'int', nullable: true })
  txnSign: number | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => PrnUploadBatchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batchId' })
  batch: PrnUploadBatchEntity;
}
