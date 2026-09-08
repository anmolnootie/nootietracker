import { Controller, Get, Post, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(@Request() req: any) {
    return this.notificationsService.listForUser(req.user.userId);
  }

  @Get('unread-count')
  async unreadCount(@Request() req: any) {
    return { count: await this.notificationsService.unreadCount(req.user.userId) };
  }

  @Post(':id/read')
  async markRead(@Param('id') id: string) {
    await this.notificationsService.markRead(id);
    return { success: true };
  }

  @Post('read-all')
  async markAllRead(@Request() req: any) {
    await this.notificationsService.markAllRead(req.user.userId);
    return { success: true };
  }
}
