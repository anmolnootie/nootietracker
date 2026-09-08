import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { POMappingStatus } from '@po-control-tower/shared';
import { POMasterEntity } from './po-master.entity';

/**
 * Connects a quantity of stock stuck on an old/expired PO to a new, live PO -
 * one row per link, so "1 old PO -> many new POs" and "many old POs -> 1 new
 * PO" both fall out naturally from multiple rows sharing an originalPoId or
 * newPoId. `status` is this link's own lifecycle (a person can reject/cancel
 * a specific mapping); how much of the *original* PO/SKU's stuck quantity is
 * covered overall (Unmapped/Partially/Fully mapped) is a computed rollup
 * across all of a SKU's ACTIVE mappings, not a field on any single row.
 */
@Entity('po_mappings')
export class POMappingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  originalPoId: string;

  @Column()
  originalPoNumber: string;

  @Column()
  skuCode: string;

  @Column()
  skuName: string;

  @Column()
  newPoId: string;

  @Column()
  newPoNumber: string;

  @Column('decimal', { precision: 12, scale: 2 })
  originalQuantity: number;

  @Column('decimal', { precision: 12, scale: 2 })
  availableQuantity: number;

  @Column('decimal', { precision: 12, scale: 2 })
  quantityMapped: number;

  @Column('decimal', { precision: 12, scale: 2 })
  quantityRemaining: number;

  @Column('decimal', { precision: 15, scale: 2 })
  originalValue: number;

  @Column('decimal', { precision: 15, scale: 2 })
  valueMapped: number;

  @Column('decimal', { precision: 15, scale: 2 })
  valueRemaining: number;

  @Column({ type: 'timestamp' })
  mappingDate: Date;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  newAppointmentDate: Date | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ type: 'enum', enum: POMappingStatus, default: POMappingStatus.ACTIVE })
  status: POMappingStatus;

  @Column({ type: 'uuid', nullable: true })
  createdByUserId: string | null;

  /**
   * Set once the new PO's GRN actually completes for this line - the real
   * "this stock is consumed, not just allocated" milestone. Mapping alone
   * never sets this (Mapped != Resolved); it's the trigger that permanently
   * deducts this quantity from the original stuck-stock record and, once a
   * SKU's stuck quantity is fully recovered this way, auto-resolves it.
   */
  @Column({ type: 'timestamp', nullable: true })
  recoveredAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => POMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'originalPoId' })
  originalPo: POMasterEntity;

  @ManyToOne(() => POMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'newPoId' })
  newPo: POMasterEntity;
}
