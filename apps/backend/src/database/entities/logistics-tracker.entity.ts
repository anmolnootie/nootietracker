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

  @Column({ nullable: true })
  lastTrackedStatus: string;

  @Column({ nullable: true })
  lastUpdateTime: Date;

  @Column({ nullable: true })
  hoursWithoutMovement: number;

  @Column({ default: false })
  receivedAndActioned: boolean;

  @Column({ nullable: true })
  receivedAndActionedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => POMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poId' })
  po: POMasterEntity;
}
