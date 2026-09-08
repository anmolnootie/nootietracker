import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReturnTrackerEntity } from '../../database/entities/return-tracker.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POStatus } from '@po-control-tower/shared';

@Injectable()
export class ReturnsService {
  constructor(
    @InjectRepository(ReturnTrackerEntity)
    private readonly returnRepository: Repository<ReturnTrackerEntity>,
    @InjectRepository(POMasterEntity)
    private readonly poRepository: Repository<POMasterEntity>,
  ) {}

  async list(): Promise<ReturnTrackerEntity[]> {
    return this.returnRepository.find({ relations: ['po'], order: { createdAt: 'DESC' } });
  }

  async getByPo(poId: string): Promise<ReturnTrackerEntity | null> {
    return this.returnRepository.findOneBy({ poId });
  }

  async create(
    poId: string,
    data: { returnType: ReturnTrackerEntity['returnType']; rootCause?: string; lossAmount?: number },
  ): Promise<ReturnTrackerEntity> {
    const existing = await this.returnRepository.findOneBy({ poId });
    if (existing) return existing;

    const record = this.returnRepository.create({
      poId,
      returnDate: new Date(),
      returnType: data.returnType,
      rootCause: data.rootCause,
      lossAmount: data.lossAmount,
    });
    const saved = await this.returnRepository.save(record);

    const po = await this.poRepository.findOneBy({ id: poId });
    if (po) {
      po.status = POStatus.RETURNED;
      await this.poRepository.save(po);
    }

    return saved;
  }

  async close(
    id: string,
    data: { rootCause: string; creditNoteNumber?: string; lossAmount?: number },
  ): Promise<ReturnTrackerEntity> {
    if (!data.rootCause) {
      throw new BadRequestException('Root cause is required to close a return');
    }
    const record = await this.returnRepository.findOneBy({ id });
    if (!record) throw new NotFoundException('Return record not found');

    record.rootCause = data.rootCause;
    if (data.creditNoteNumber) record.creditNoteNumber = data.creditNoteNumber;
    if (data.lossAmount !== undefined) record.lossAmount = data.lossAmount;
    return this.returnRepository.save(record);
  }
}
