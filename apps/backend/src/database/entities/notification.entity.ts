import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('notifications')
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'varchar', nullable: true })
  poId: string;

  @Column({ type: 'varchar', nullable: true })
  taskId: string;

  @Column()
  type: string;

  @Column({
    type: 'enum',
    enum: ['WHATSAPP', 'EMAIL', 'IN_APP'],
  })
  channel: 'WHATSAPP' | 'EMAIL' | 'IN_APP';

  @Column()
  title: string;

  @Column()
  message: string;

  @Column({ default: false })
  isRead: boolean;

  @CreateDateColumn()
  sentAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date;
}
