import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DocumentEntity } from '../../database/entities/document.entity';
import { FileStorageService } from './file-storage.service';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documentRepository: Repository<DocumentEntity>,
    private readonly fileStorageService: FileStorageService,
  ) {}

  async create(params: {
    poId: string;
    documentType: string;
    fileName: string;
    filePath: string;
    uploadedBy: string;
  }): Promise<DocumentEntity> {
    const doc = this.documentRepository.create(params);
    return this.documentRepository.save(doc);
  }

  async listByPo(poId: string): Promise<DocumentEntity[]> {
    return this.documentRepository.find({
      where: { poId },
      order: { uploadedAt: 'DESC' },
    });
  }

  async getById(id: string): Promise<DocumentEntity> {
    const doc = await this.documentRepository.findOneBy({ id });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async delete(id: string): Promise<void> {
    const doc = await this.getById(id);
    await this.fileStorageService.remove(doc.filePath);
    await this.documentRepository.delete({ id });
  }

  /** Used when a PO is permanently deleted - removes every uploaded file and its DB row for that PO. */
  async deleteByPoId(poId: string): Promise<void> {
    const docs = await this.listByPo(poId);
    for (const doc of docs) {
      await this.fileStorageService.remove(doc.filePath);
    }
    await this.documentRepository.delete({ poId });
  }
}
