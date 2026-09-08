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

  @Column({ type: 'varchar', nullable: true })
  grnNumber: string;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  grnValue: number;

  @Column({ type: 'timestamp', nullable: true })
  grnDate: Date;

  @Column({
    type: 'enum',
    enum: GRNOutcome,
    nullable: true,
  })
  outcome: GRNOutcome;

  @Column({ type: 'text', nullable: true })
  discrepancyReason: string;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  discrepancyAmount: number;

  @Column({ type: 'varchar', nullable: true })
  creditNoteNumber: string;

  @Column({ type: 'varchar', nullable: true })
  debitNoteNumber: string;

  @Column({
    type: 'enum',
    enum: ['ON_TIME', 'ESCALATED', 'BREACHED'],
    default: 'ON_TIME',
  })
  slaStatus: 'ON_TIME' | 'ESCALATED' | 'BREACHED';

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  grnQuantity: number | null;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  acceptedQuantity: number | null;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  rejectedQuantity: number | null;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  shortQuantity: number | null;

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
