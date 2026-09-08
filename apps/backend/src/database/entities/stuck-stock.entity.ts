import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { StuckStockReason, StuckStockStatus } from '@po-control-tower/shared';
import { POMasterEntity } from './po-master.entity';

/**
 * One row per (PO, SKU) whose ordered quantity never made it out the door for
 * a "stuck" reason (expired/cancelled PO, missed/expired appointment, RTO,
 * rejection, ...). Populated by StuckStockService's detection sweep, not
 * hand-entered - quantity/value/reason get refreshed on every sweep, but
 * status/ownerId/mappedPoId/remarks are workflow state a person owns, so
 * detection never overwrites them once set.
 */
@Entity('stuck_stock')
export class StuckStockEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  poId: string;

  @Column()
  poNumber: string;

  @Column()
  skuCode: string;

  @Column()
  skuName: string;

  @Column('decimal', { precision: 12, scale: 2 })
  quantity: number;

  @Column('decimal', { precision: 15, scale: 2 })
  value: number;

  @Column({ type: 'varchar', nullable: true })
  warehouse: string | null;

  @Column({ type: 'timestamp', nullable: true })
  dateDispatched: Date | null;

  @Column({ type: 'enum', enum: StuckStockReason })
  reason: StuckStockReason;

  @Column({ type: 'enum', enum: StuckStockStatus, default: StuckStockStatus.OPEN })
  status: StuckStockStatus;

  @Column({ type: 'uuid', nullable: true })
  mappedPoId: string | null;

  /** Sum of quantityMapped across every mapping line whose new PO has actually completed GRN for it - permanently deducted, unlike the ACTIVE-mapped total used for OPEN/PARTIALLY_MAPPED/MAPPED status. */
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  recoveredQuantity: number;

  @Column({ type: 'uuid', nullable: true })
  ownerId: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn()
  firstDetectedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => POMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poId' })
  po: POMasterEntity;
}
