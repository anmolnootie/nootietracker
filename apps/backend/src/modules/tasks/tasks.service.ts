import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { TaskEntity } from '../../database/entities/task.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { UserRole } from '@po-control-tower/shared';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(TaskEntity)
    private readonly taskRepository: Repository<TaskEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(filters: { ownerId?: string; status?: string }): Promise<TaskEntity[]> {
    const where: any = {};
    if (filters.ownerId) where.ownerId = filters.ownerId;
    // One status, or several comma-separated (e.g. "OPEN,ESCALATED").
    if (filters.status) where.status = filters.status.includes(',') ? In(filters.status.split(',')) : filters.status;
    return this.taskRepository.find({
      where,
      relations: ['po'],
      order: { slaDueAt: 'ASC' },
    });
  }

  async getById(id: string): Promise<TaskEntity> {
    const task = await this.taskRepository.findOne({ where: { id }, relations: ['po'] });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async complete(id: string, notes?: string): Promise<TaskEntity> {
    const task = await this.getById(id);
    task.status = 'COMPLETED';
    task.completedAt = new Date();
    if (notes) task.notes = notes;
    return this.taskRepository.save(task);
  }

  async reassign(id: string, ownerId: string): Promise<TaskEntity> {
    const task = await this.getById(id);
    const newOwner = await this.userRepository.findOneBy({ id: ownerId });
    if (!newOwner) throw new BadRequestException('New owner not found');

    task.ownerId = ownerId;
    task.status = 'OPEN';
    const saved = await this.taskRepository.save(task);

    await this.notificationsService.notify({
      userId: ownerId,
      type: 'TASK_REASSIGNED',
      title: `Task reassigned to you: ${task.taskType}`,
      message: `PO ${task.po?.poNumber ?? task.poId} - ${task.taskType} task reassigned to you`,
      poId: task.poId,
      taskId: task.id,
    });

    return saved;
  }

  /**
   * Self-escalation-skip rule: if the current owner already holds the escalation
   * target role (SCM/ADMIN), escalating "to themselves" is a no-op, so the engine
   * skips to the next distinct SCM/ADMIN user instead.
   */
  async escalate(id: string): Promise<TaskEntity> {
    const task = await this.getById(id);
    const currentOwner = await this.userRepository.findOneBy({ id: task.ownerId });

    const escalationTargets = await this.userRepository
      .createQueryBuilder('user')
      .where('user.isActive = true')
      .andWhere('user.roles && ARRAY[:...roles]::text[]', { roles: [UserRole.SCM, UserRole.ADMIN] })
      .getMany();

    const nextOwner =
      escalationTargets.find((u) => u.id !== task.ownerId) ||
      currentOwner ||
      escalationTargets[0];

    if (nextOwner) {
      task.ownerId = nextOwner.id;
    }
    task.status = 'ESCALATED';
    const saved = await this.taskRepository.save(task);

    if (nextOwner) {
      await this.notificationsService.notify({
        userId: nextOwner.id,
        type: 'TASK_ESCALATED',
        title: `Escalated: ${task.taskType}`,
        message: `PO ${task.po?.poNumber ?? task.poId} - ${task.taskType} task escalated to you (SLA breached)`,
        poId: task.poId,
        taskId: task.id,
      });
    }

    return saved;
  }

  async comment(id: string, text: string): Promise<TaskEntity> {
    const task = await this.getById(id);
    const stamp = new Date().toISOString();
    task.notes = `${task.notes ? task.notes + '\n' : ''}[${stamp}] ${text}`;
    return this.taskRepository.save(task);
  }

  async findOverdueOpenTasks(): Promise<TaskEntity[]> {
    return this.taskRepository
      .createQueryBuilder('task')
      .where('task.status = :status', { status: 'OPEN' })
      .andWhere('task.slaDueAt < :now', { now: new Date() })
      .getMany();
  }

  async pushSlaDueAt(id: string, dueAt: Date): Promise<TaskEntity> {
    const task = await this.getById(id);
    task.slaDueAt = dueAt;
    return this.taskRepository.save(task);
  }

  async findOpenByPoAndType(poId: string, taskType: string): Promise<TaskEntity | null> {
    return this.taskRepository.findOne({
      where: { poId, taskType: taskType as any, status: 'OPEN' },
    });
  }

  /**
   * A task that still needs doing: OPEN, but also ESCALATED - escalating an
   * overdue task changes its status without anyone having done the work, so
   * "is there an open task for this PO" must not stop being true when the SLA
   * is breached.
   */
  async findUnresolvedByPoAndType(poId: string, taskType: string): Promise<TaskEntity | null> {
    return this.taskRepository.findOne({
      where: { poId, taskType: taskType as any, status: Not('COMPLETED') },
    });
  }

  async findUnresolvedByType(taskType: string): Promise<TaskEntity[]> {
    return this.taskRepository.find({ where: { taskType: taskType as any, status: Not('COMPLETED') } });
  }

  // notify: false for callers that create many at once and send their own summary.
  async create(data: Partial<TaskEntity>, notify = true): Promise<TaskEntity> {
    const task = this.taskRepository.create(data);
    const saved = await this.taskRepository.save(task);
    if (notify && saved.ownerId) {
      await this.notificationsService.notify({
        userId: saved.ownerId,
        type: 'TASK_CREATED',
        title: `New task: ${saved.taskType}`,
        message: `A new ${saved.taskType} task has been assigned to you`,
        poId: saved.poId,
        taskId: saved.id,
      });
    }
    return saved;
  }
}
