import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { POMasterEntity } from './po-master.entity';

@Entity('po_line_items')
export class POLineItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  poId: string;

  @Column()
  skuCode: string;

  @Column()
  skuName: string;

  @Column('decimal', { precision: 10, scale: 2 })
  quantity: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  quantityReceived: number;

  @Column({
    type: 'enum',
    enum: ['AVAILABLE', 'SHORT', 'NOT_AVAILABLE'],
    default: 'NOT_AVAILABLE',
  })
  availability: 'AVAILABLE' | 'SHORT' | 'NOT_AVAILABLE';

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => POMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poId' })
  po: POMasterEntity;
}
