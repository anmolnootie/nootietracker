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

@Entity('dispatch')
export class DispatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  poId: string;

  @Column()
  idealDispatchDate: Date;

  @Column()
  latestSafeDispatchDate: Date;

  @Column({ nullable: true })
  actualDispatchDate: Date;

  @Column({ nullable: true })
  docketNumber: string;

  @Column({ nullable: true })
  transporterId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => POMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poId' })
  po: POMasterEntity;
}
