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

  @Column({ type: 'varchar', nullable: true })
  upc: string | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  mrp: number | null;

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

  // Bulk PO Compilation Engine
  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  acceptedQuantity: number | null;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  dispatchedQuantity: number | null;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  deliveredQuantity: number | null;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  rejectedQuantity: number | null;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  pendingQuantity: number | null;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  unitPrice: number | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  lineValue: number | null;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  fulfilmentPercent: number | null;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  pendingPercent: number | null;

  // Manually-maintained stock check - there is no live inventory integration,
  // so this is a person-entered number (e.g. warehouse team confirming what's
  // physically on hand against this line), used purely for the Available/
  // Fulfillable Value calculations on the Edit PO screen.
  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  availableQuantity: number | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => POMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poId' })
  po: POMasterEntity;
}
