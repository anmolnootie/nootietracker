import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { format } from 'date-fns';

import { CompilationEntity } from '../../database/entities/compilation.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';

export interface CompilationFilters {
  platform?: string;
  location?: string;
  vendor?: string;
  status?: string;
  poDateFrom?: string;
  poDateTo?: string;
  expiryDateFrom?: string;
  expiryDateTo?: string;
  appointmentDateFrom?: string;
  appointmentDateTo?: string;
  skuCode?: string;
  dispatchStatus?: 'DISPATCHED' | 'NOT_DISPATCHED';
}

@Injectable()
export class CompilationsService {
  constructor(
    @InjectRepository(CompilationEntity) private readonly compilationRepository: Repository<CompilationEntity>,
    @InjectRepository(POMasterEntity) private readonly poRepository: Repository<POMasterEntity>,
  ) {}

  /** Live filter preview - never persisted, just matches POs in the current PO Master. */
  async previewFilter(filters: CompilationFilters): Promise<POMasterEntity[]> {
    let qb = this.poRepository.createQueryBuilder('po');
    let joinedAppointment = false;
    let joinedLine = false;

    if (filters.platform) qb = qb.andWhere('po.channelId = :platform', { platform: filters.platform });
    if (filters.location) qb = qb.andWhere('po.location ILIKE :location', { location: `%${filters.location}%` });
    if (filters.vendor) qb = qb.andWhere('po.customerId ILIKE :vendor', { vendor: `%${filters.vendor}%` });
    if (filters.status) qb = qb.andWhere('po.status = :status', { status: filters.status });
    if (filters.poDateFrom) qb = qb.andWhere('po.poDate >= :poDateFrom', { poDateFrom: filters.poDateFrom });
    if (filters.poDateTo) qb = qb.andWhere('po.poDate <= :poDateTo', { poDateTo: filters.poDateTo });
    if (filters.expiryDateFrom) qb = qb.andWhere('po.poExpiryDate >= :expiryDateFrom', { expiryDateFrom: filters.expiryDateFrom });
    if (filters.expiryDateTo) qb = qb.andWhere('po.poExpiryDate <= :expiryDateTo', { expiryDateTo: filters.expiryDateTo });

    if (filters.appointmentDateFrom || filters.appointmentDateTo) {
      qb = qb.innerJoin(AppointmentEntity, 'appt', 'appt.poId = po.id');
      joinedAppointment = true;
      if (filters.appointmentDateFrom) qb = qb.andWhere('appt.appointmentDate >= :apptFrom', { apptFrom: filters.appointmentDateFrom });
      if (filters.appointmentDateTo) qb = qb.andWhere('appt.appointmentDate <= :apptTo', { apptTo: filters.appointmentDateTo });
    }

    if (filters.dispatchStatus) {
      qb = qb.innerJoin(DispatchEntity, 'dispatch', 'dispatch.poId = po.id');
      qb =
        filters.dispatchStatus === 'DISPATCHED'
          ? qb.andWhere('dispatch.actualDispatchDate IS NOT NULL')
          : qb.andWhere('dispatch.actualDispatchDate IS NULL');
    }

    if (filters.skuCode) {
      qb = qb.innerJoin(POLineItemEntity, 'li', 'li.poId = po.id');
      joinedLine = true;
      qb = qb.andWhere('li.skuCode ILIKE :skuCode', { skuCode: `%${filters.skuCode}%` });
    }

    if (joinedAppointment || joinedLine) qb = qb.distinct(true);

    return qb.orderBy('po.poExpiryDate', 'ASC').getMany();
  }

  async create(data: { name?: string; filters: CompilationFilters; poIds: string[]; userId: string }): Promise<CompilationEntity> {
    if (!data.poIds || data.poIds.length === 0) {
      throw new BadRequestException('At least one PO must be selected for a compilation');
    }
    const compilationCode = await this.generateCode();
    const periodStart = data.filters.poDateFrom ? new Date(data.filters.poDateFrom) : null;
    const periodEnd = data.filters.poDateTo ? new Date(data.filters.poDateTo) : null;

    return this.compilationRepository.save(
      this.compilationRepository.create({
        compilationCode,
        name: data.name,
        createdByUserId: data.userId,
        periodStart,
        periodEnd,
        filters: data.filters,
        poIds: data.poIds,
      }),
    );
  }

  list(): Promise<CompilationEntity[]> {
    return this.compilationRepository.find({ order: { createdAt: 'DESC' } });
  }

  async getById(id: string): Promise<{ compilation: CompilationEntity; pos: POMasterEntity[] }> {
    const compilation = await this.compilationRepository.findOneBy({ id });
    if (!compilation) throw new NotFoundException('Compilation not found');
    // Always re-fetched live - a compilation stores references, not copies, so
    // it reflects whatever state its POs are in right now, not at creation time.
    const pos = compilation.poIds.length ? await this.poRepository.findBy({ id: In(compilation.poIds) }) : [];
    return { compilation, pos };
  }

  async delete(id: string): Promise<void> {
    const result = await this.compilationRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('Compilation not found');
  }

  private async generateCode(): Promise<string> {
    const datePart = format(new Date(), 'yyyyMMdd');
    const countToday = await this.compilationRepository
      .createQueryBuilder('c')
      .where('c.compilationCode LIKE :pattern', { pattern: `COMP-${datePart}-%` })
      .getCount();
    const seq = String(countToday + 1).padStart(3, '0');
    return `COMP-${datePart}-${seq}`;
  }
}
