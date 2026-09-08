import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sku_master')
export class SkuMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  skuCode: string;

  @Column()
  skuName: string;

  @Column({ type: 'varchar', nullable: true })
  upc: string | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  mrp: number | null;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  unitPrice: number | null;

  @Column('int', { default: 0 })
  stockQuantity: number;

  @Column({ type: 'varchar', nullable: true })
  sourceFileName: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastUploadedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
