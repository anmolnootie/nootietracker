import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { GRNOutcome } from '@po-control-tower/shared';
import { POMasterEntity } from './po-master.entity';

@Entity('grn_trackers')
export class GRNTrackerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  poId: string;

  @Column({ nullable: true })
  grnNumber: string;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  grnValue: number;

  @Column({ nullable: true })
  grnDate: Date;

  @Column({
    type: 'enum',
    enum: GRNOutcome,
    nullable: true,
  })
  outcome: GRNOutcome;

  @Column({ nullable: true })
  discrepancyReason: string;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  discrepancyAmount: number;

  @Column({ nullable: true })
  creditNoteNumber: string;

  @Column({ nullable: true })
  debitNoteNumber: string;

  @Column({
    type: 'enum',
    enum: ['ON_TIME', 'ESCALATED', 'BREACHED'],
    default: 'ON_TIME',
  })
  slaStatus: 'ON_TIME' | 'ESCALATED' | 'BREACHED';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => POMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poId' })
  po: POMasterEntity;
}
