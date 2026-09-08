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

  @Column({ type: 'timestamp', nullable: true })
  requestedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  confirmedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  appointmentDate?: Date | null;

  @Column({ type: 'varchar', nullable: true })
  appointmentWindow?: string | null;

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

  @Column({ type: 'timestamp', nullable: true })
  newExpiryDate?: Date | null;

  @Column({ type: 'varchar', nullable: true })
  appointmentId: string | null;

  @Column({ type: 'varchar', nullable: true })
  appointmentTime: string | null;

  @Column({ type: 'varchar', nullable: true })
  appointmentLocation: string | null;

  @Column({ type: 'timestamp', nullable: true })
  extensionRequestedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  extensionReason: string | null;

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
