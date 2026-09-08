import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ExceptionType, ExceptionSeverity, ExceptionResolutionStatus } from '@po-control-tower/shared';

@Entity('exceptions')
export class ExceptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true, type: 'uuid' })
  batchId: string;

  @Column({ nullable: true, type: 'uuid' })
  poId: string;

  @Column({ nullable: true, type: 'uuid' })
  rawRowId: string;

  @Column({ nullable: true, type: 'uuid' })
  processedRowId: string;

  @Column({ nullable: true })
  poNumber: string;

  @Column({ nullable: true })
  skuCode: string;

  @Column({ nullable: true })
  warehouse: string;

  @Column({ type: 'enum', enum: ExceptionType })
  exceptionType: ExceptionType;

  @Column({ type: 'enum', enum: ExceptionSeverity })
  severity: ExceptionSeverity;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  financialImpact: number;

  @CreateDateColumn()
  detectedAt: Date;

  @Column({ nullable: true, type: 'uuid' })
  ownerId: string;

  @Column({ type: 'text', nullable: true })
  recommendedAction: string;

  @Column({ type: 'enum', enum: ExceptionResolutionStatus, default: ExceptionResolutionStatus.OPEN })
  resolutionStatus: ExceptionResolutionStatus;

  @Column({ type: 'text', nullable: true })
  resolutionNotes: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
