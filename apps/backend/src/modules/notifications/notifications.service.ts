import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from '../../database/entities/notification.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepository: Repository<NotificationEntity>,
  ) {}

  async notify(params: {
    userId: string;
    type: string;
    title: string;
    message: string;
    poId?: string;
    taskId?: string;
  }): Promise<void> {
    const inApp = this.notificationRepository.create({
      userId: params.userId,
      poId: params.poId,
      taskId: params.taskId,
      type: params.type,
      channel: 'IN_APP',
      title: params.title,
      message: params.message,
      isRead: false,
    });
    await this.notificationRepository.save(inApp);

    // WhatsApp / Email are stubbed for local dev - logged instead of sent.
    this.logger.log(`[WHATSAPP/EMAIL stub] -> user ${params.userId}: ${params.title} - ${params.message}`);
  }

  async listForUser(userId: string): Promise<NotificationEntity[]> {
    return this.notificationRepository.find({
      where: { userId },
      order: { sentAt: 'DESC' },
      take: 50,
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({ where: { userId, isRead: false } });
  }

  async markRead(id: string): Promise<void> {
    await this.notificationRepository.update(id, { isRead: true, readAt: new Date() });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationRepository.update({ userId, isRead: false }, { isRead: true, readAt: new Date() });
  }

  async deleteByPoId(poId: string): Promise<void> {
    await this.notificationRepository.delete({ poId });
  }
}
