import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TaskType } from '@po-control-tower/shared';
import { POMasterEntity } from './po-master.entity';

@Entity('tasks')
export class TaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  poId: string;

  @Column({
    type: 'enum',
    enum: TaskType,
  })
  taskType: TaskType;

  @Column()
  ownerId: string;

  @Column({
    type: 'enum',
    enum: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'ESCALATED'],
    default: 'OPEN',
  })
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'ESCALATED';

  @Column()
  slaDueAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @ManyToOne(() => POMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poId' })
  po: POMasterEntity;
}
