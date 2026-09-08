import { Controller, Get, Post, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TasksService } from './tasks.service';

@Controller('tasks')
@UseGuards(AuthGuard('jwt'))
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async list(
    @Request() req: any,
    @Query('mine') mine?: string,
    @Query('status') status?: string,
  ) {
    return this.tasksService.list({
      ownerId: mine === 'true' ? req.user.userId : undefined,
      status,
    });
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.tasksService.getById(id);
  }

  @Post(':id/complete')
  async complete(@Param('id') id: string, @Body() body: { notes?: string }) {
    return this.tasksService.complete(id, body?.notes);
  }

  @Post(':id/reassign')
  async reassign(@Param('id') id: string, @Body() body: { ownerId: string }) {
    return this.tasksService.reassign(id, body.ownerId);
  }

  @Post(':id/escalate')
  async escalate(@Param('id') id: string) {
    return this.tasksService.escalate(id);
  }

  @Post(':id/comment')
  async comment(@Param('id') id: string, @Body() body: { text: string }) {
    return this.tasksService.comment(id, body.text);
  }
}
