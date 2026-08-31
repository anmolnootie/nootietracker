import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('transporter_masters')
export class TransporterMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column('int')
  transitTimeDays: number;

  @Column('decimal', { precision: 5, scale: 2 })
  onTimePercentage: number;

  @Column({ nullable: true })
  cutOffTime: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
