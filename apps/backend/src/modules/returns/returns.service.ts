import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReturnTrackerEntity } from '../../database/entities/return-tracker.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { POStatus } from '@po-control-tower/shared';

@Injectable()
export class ReturnsService {
  constructor(
    @InjectRepository(ReturnTrackerEntity)
    private readonly returnRepository: Repository<ReturnTrackerEntity>,
    @InjectRepository(POMasterEntity)
    private readonly poRepository: Repository<POMasterEntity>,
    @InjectRepository(POLineItemEntity)
    private readonly lineItemRepository: Repository<POLineItemEntity>,
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

    // A RECALL_NOT_DELIVERED return means the whole dispatched shipment is
    // physically back, not with the customer - reset dispatchedQuantity so
    // this stock reads as available again (stuck-stock detection and PO
    // Mapping's availability math both key off quantity - dispatchedQuantity,
    // which would otherwise stay 0 forever for an already-dispatched PO).
    // The other return types (REJECTED_GRN/DAMAGE/SHORTAGE) happen post-GRN,
    // a different accounting situation - left untouched.
    if (data.returnType === 'RECALL_NOT_DELIVERED') {
      await this.lineItemRepository.update({ poId }, { dispatchedQuantity: 0 });
    }

    return saved;
  }

  async close(
    id: string,
    data: { rootCause: string; creditNoteNumber?: string; lossAmount?: number; dncnType?: 'DEBIT' | 'CREDIT'; dncnValue?: number },
  ): Promise<ReturnTrackerEntity> {
    if (!data.rootCause) {
      throw new BadRequestException('Root cause is required to close a return');
    }
    const record = await this.returnRepository.findOneBy({ id });
    if (!record) throw new NotFoundException('Return record not found');

    record.rootCause = data.rootCause;
    if (data.creditNoteNumber) record.creditNoteNumber = data.creditNoteNumber;
    if (data.lossAmount !== undefined) record.lossAmount = data.lossAmount;
    if (data.dncnType !== undefined) record.dncnType = data.dncnType;
    if (data.dncnValue !== undefined) record.dncnValue = data.dncnValue;
    return this.returnRepository.save(record);
  }
}
