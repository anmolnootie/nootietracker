import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { POStatus, RiskStatus, FulfilmentStatus, FulfilmentDecision, NonFulfilmentReason } from '@po-control-tower/shared';
import { UserEntity } from './user.entity';

@Entity('po_master')
export class POMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  poNumber: string;

  @Column({ type: 'timestamp' })
  poDate: Date;

  @Column({ type: 'timestamp' })
  poExpiryDate: Date;

  @Column()
  channelId: string;

  @Column()
  customerId: string;

  @Column()
  location: string;

  @Column('decimal', { precision: 15, scale: 2 })
  poValue: number;

  @Column({
    type: 'enum',
    enum: POStatus,
    default: POStatus.RECEIVED,
  })
  status: POStatus;

  @Column({
    type: 'enum',
    enum: RiskStatus,
    default: RiskStatus.GREEN,
  })
  riskStatus: RiskStatus;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  priorityScore: number;

  @Column('uuid')
  overallOwnerId: string;

  @Column({ nullable: true, type: 'uuid' })
  appointmentOwnerId: string;

  @Column({ nullable: true, type: 'uuid' })
  dispatchOwnerId: string;

  @Column({ nullable: true, type: 'uuid' })
  logisticsOwnerId: string;

  @Column({ nullable: true, type: 'uuid' })
  grnOwnerId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  lastStatusChangeAt: Date;

  // Bulk PO Compilation Engine
  @Column({ type: 'enum', enum: ['MANUAL', 'BULK_IMPORT'], default: 'MANUAL' })
  sourceType: 'MANUAL' | 'BULK_IMPORT';

  @Column({ nullable: true, type: 'uuid' })
  lastBulkBatchId: string;

  @Column({ type: 'enum', enum: FulfilmentStatus, nullable: true })
  fulfilmentStatus: FulfilmentStatus;

  @Column({ nullable: true })
  appointmentStatusRaw: string;

  @Column({ nullable: true })
  deliveryStatusRaw: string;

  @Column({ nullable: true })
  poStatusRaw: string;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  // Edit PO recalculation fields
  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  availableStockValue: number | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  dispatchValue: number | null;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  fulfilmentPercent: number | null;

  @Column({ default: false })
  isLowPoValue: boolean;

  // PO Bin (soft delete)
  @Column({ default: false })
  isDeleted: boolean;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  deletedByUserId: string | null;

  // Non-fulfilment - a business decision, distinct from the system-computed isLowPoValue flag
  @Column({ type: 'enum', enum: FulfilmentDecision, default: FulfilmentDecision.FULFILLED })
  fulfilmentDecision: FulfilmentDecision;

  @Column({ type: 'enum', enum: NonFulfilmentReason, nullable: true })
  nonFulfilmentReason: NonFulfilmentReason | null;

  @Column({ type: 'text', nullable: true })
  nonFulfilmentRemarks: string | null;

  // A snapshot of what the system itself could tell about this PO's state at
  // the moment it was marked - taken then rather than computed live later,
  // since the underlying dispatch/stock/exception state keeps changing and
  // would otherwise silently rewrite the historical reasoning behind a past
  // decision.
  @Column({ type: 'text', nullable: true })
  nonFulfilmentSystemRemarks: string | null;

  @Column({ type: 'timestamp', nullable: true })
  nonFulfilmentAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  nonFulfilmentByUserId: string | null;
}
