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

@Entity('return_trackers')
export class ReturnTrackerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  poId: string;

  @Column({ type: 'timestamp' })
  returnDate: Date;

  @Column({
    type: 'enum',
    enum: ['RECALL_NOT_DELIVERED', 'REJECTED_GRN', 'DAMAGE', 'SHORTAGE'],
  })
  returnType: 'RECALL_NOT_DELIVERED' | 'REJECTED_GRN' | 'DAMAGE' | 'SHORTAGE';

  @Column({ type: 'text', nullable: true })
  rootCause: string;

  @Column({ type: 'varchar', nullable: true })
  creditNoteNumber: string;

  // DNCN = Debit Note / Credit Note, raised against the AWB when a PO is
  // returned rather than reattempted. creditNoteNumber above doubles as the
  // DNCN number field regardless of type - these two just add the type/value.
  @Column({ type: 'enum', enum: ['DEBIT', 'CREDIT'], nullable: true })
  dncnType: 'DEBIT' | 'CREDIT' | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  dncnValue: number | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  lossAmount: number;

  @Column({ type: 'varchar', nullable: true })
  returnStatus: string | null;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  returnQuantity: number | null;

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
