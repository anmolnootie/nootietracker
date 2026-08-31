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

  @Column({ nullable: true })
  poId: string;

  @Column({ nullable: true })
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

  @Column({ nullable: true })
  readAt: Date;
}
