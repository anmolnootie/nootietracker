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

  @Column()
  returnDate: Date;

  @Column({
    type: 'enum',
    enum: ['RECALL_NOT_DELIVERED', 'REJECTED_GRN', 'DAMAGE', 'SHORTAGE'],
  })
  returnType: 'RECALL_NOT_DELIVERED' | 'REJECTED_GRN' | 'DAMAGE' | 'SHORTAGE';

  @Column({ nullable: true })
  rootCause: string;

  @Column({ nullable: true })
  creditNoteNumber: string;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  lossAmount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => POMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poId' })
  po: POMasterEntity;
}
