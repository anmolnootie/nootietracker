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
import { POStatus, RiskStatus } from '@po-control-tower/shared';
import { UserEntity } from './user.entity';

@Entity('po_master')
export class POMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  poNumber: string;

  @Column()
  poDate: Date;

  @Column()
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
}
