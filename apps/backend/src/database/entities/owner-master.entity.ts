import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('owner_masters')
export class OwnerMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'varchar', nullable: true })
  channel: string;

  @Column({ type: 'varchar', nullable: true })
  location: string;

  @Column()
  responsibility: string;

  @Column({ type: 'varchar', nullable: true })
  backupOwnerId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
