import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('customer_masters')
export class CustomerMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  channel: string;

  @Column('int', { default: 3 })
  appointmentRequirementInDays: number;

  @Column('text', { array: true, default: ['MON', 'WED', 'FRI'] })
  receivingDays: string[];

  @Column()
  escalationContactEmail: string;

  @Column()
  escalationContactPhone: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
