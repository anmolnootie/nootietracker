import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('po_change_history')
export class POChangeHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  poId: string;

  @Column({ type: 'varchar', nullable: true })
  skuCode: string | null;

  @Column()
  fieldName: string;

  @Column({ type: 'text', nullable: true })
  oldValue: string | null;

  @Column({ type: 'text', nullable: true })
  newValue: string | null;

  @Column()
  changeType: string;

  @Column({ nullable: true, type: 'uuid' })
  sourceBatchId: string | null;

  @Column({ type: 'varchar', nullable: true })
  sourceFileName: string | null;

  @Column({ nullable: true, type: 'uuid' })
  changedByUserId: string | null;

  @CreateDateColumn()
  changedAt: Date;
}
