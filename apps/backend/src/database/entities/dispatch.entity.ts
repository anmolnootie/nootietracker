import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { LocationType, DispatchPlanStatus, DispatchVarianceLabel } from '@po-control-tower/shared';
import { POMasterEntity } from './po-master.entity';

@Entity('dispatch')
export class DispatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  poId: string;

  @Column({ type: 'timestamp' })
  idealDispatchDate: Date;

  @Column({ type: 'timestamp' })
  latestSafeDispatchDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  actualDispatchDate: Date;

  @Column({ type: 'varchar', nullable: true })
  docketNumber: string;

  @Column({ type: 'varchar', nullable: true })
  transporterId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => POMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poId' })
  po: POMasterEntity;

  // Location-based Dynamic Dispatch Date Engine
  @Column({ type: 'enum', enum: LocationType, nullable: true })
  locationType: LocationType;

  @Column({ nullable: true })
  tatRuleDescription: string;

  @Column({ type: 'timestamp', nullable: true })
  dispatchWindowEarliest: Date;

  @Column({ type: 'timestamp', nullable: true })
  dispatchWindowLatest: Date;

  @Column({ type: 'timestamp', nullable: true })
  recommendedDispatchDate: Date;

  @Column({ type: 'enum', enum: DispatchPlanStatus, nullable: true })
  dispatchPlanStatus: DispatchPlanStatus;

  @Column({ type: 'int', nullable: true })
  dispatchVarianceDays: number | null;

  @Column({ type: 'enum', enum: DispatchVarianceLabel, nullable: true })
  dispatchVarianceLabel: DispatchVarianceLabel | null;

  // Manual override the ops team can set alongside the auto-computed
  // recommendedDispatchDate above - the system's calculation is never replaced,
  // just supplemented for exceptional cases.
  @Column({ type: 'timestamp', nullable: true })
  plannedDispatchDate: Date | null;

  @Column({ type: 'varchar', nullable: true })
  dispatchStatus: string | null;

  @Column({ type: 'varchar', nullable: true })
  invoiceNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  ewayBillNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  vehicleNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  lrNumber: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}
