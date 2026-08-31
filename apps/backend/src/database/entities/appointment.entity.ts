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

@Entity('appointments')
export class AppointmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  poId: string;

  @Column({ nullable: true })
  requestedAt: Date;

  @Column({ nullable: true })
  confirmedAt: Date;

  @Column({ nullable: true })
  appointmentDate: Date;

  @Column({ nullable: true })
  appointmentWindow: string;

  @Column({
    type: 'enum',
    enum: ['ON_TIME', 'ESCALATED', 'BREACHED'],
    default: 'ON_TIME',
  })
  slaStatus: 'ON_TIME' | 'ESCALATED' | 'BREACHED';

  @Column({ default: false })
  extensionRequested: boolean;

  @Column({ default: false })
  extensionGranted: boolean;

  @Column({ nullable: true })
  newExpiryDate: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => POMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poId' })
  po: POMasterEntity;
}
