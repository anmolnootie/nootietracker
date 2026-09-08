import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { POMasterEntity } from './po-master.entity';

@Entity('logistics_trackers')
export class LogisticsTrackerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  poId: string;

  @Column()
  docketNumber: string;

  @Column()
  transporterId: string;

  @Column({ type: 'varchar', nullable: true })
  lastTrackedStatus: string;

  @Column({ type: 'timestamp', nullable: true })
  lastUpdateTime: Date;

  @Column({ type: 'int', nullable: true })
  hoursWithoutMovement: number;

  @Column({ default: false })
  receivedAndActioned: boolean;

  @Column({ type: 'timestamp', nullable: true })
  receivedAndActionedAt: Date;

  @Column({ type: 'varchar', nullable: true })
  vehicleNumber: string | null;

  @Column({ type: 'timestamp', nullable: true })
  pickupDate: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expectedDeliveryDate: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  actualDeliveryDate: Date | null;

  @Column({ type: 'text', nullable: true })
  delayReason: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => POMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poId' })
  po: POMasterEntity;
}
