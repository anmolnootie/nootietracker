import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerMasterEntity } from '../../database/entities/customer-master.entity';
import { TransporterMasterEntity } from '../../database/entities/transporter-master.entity';
import { OwnerMasterEntity } from '../../database/entities/owner-master.entity';

@Injectable()
export class MastersService {
  constructor(
    @InjectRepository(CustomerMasterEntity)
    private readonly customerRepository: Repository<CustomerMasterEntity>,
    @InjectRepository(TransporterMasterEntity)
    private readonly transporterRepository: Repository<TransporterMasterEntity>,
    @InjectRepository(OwnerMasterEntity)
    private readonly ownerRepository: Repository<OwnerMasterEntity>,
  ) {}

  listCustomers() {
    return this.customerRepository.find({ order: { name: 'ASC' } });
  }

  createCustomer(data: Partial<CustomerMasterEntity>) {
    return this.customerRepository.save(this.customerRepository.create(data));
  }

  listTransporters() {
    return this.transporterRepository.find({ order: { name: 'ASC' } });
  }

  createTransporter(data: Partial<TransporterMasterEntity>) {
    return this.transporterRepository.save(this.transporterRepository.create(data));
  }

  listOwners() {
    return this.ownerRepository.find();
  }

  createOwner(data: Partial<OwnerMasterEntity>) {
    return this.ownerRepository.save(this.ownerRepository.create(data));
  }
}
