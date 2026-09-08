import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Request,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';

import { DocumentsService } from './documents.service';
import { FileStorageService } from './file-storage.service';

@Controller('documents')
@UseGuards(AuthGuard('jwt'))
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly fileStorageService: FileStorageService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('poId') poId: string,
    @Body('documentType') documentType: string,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('file is required');
    if (!poId) throw new BadRequestException('poId is required');
    if (!documentType) throw new BadRequestException('documentType is required');

    const filePath = await this.fileStorageService.save(file.buffer, file.originalname, file.mimetype);

    return this.documentsService.create({
      poId,
      documentType,
      fileName: file.originalname,
      filePath,
      uploadedBy: req.user.userId,
    });
  }

  @Get('by-po/:poId')
  async listByPo(@Param('poId') poId: string) {
    return this.documentsService.listByPo(poId);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const doc = await this.documentsService.getById(id);
    await this.fileStorageService.streamTo(res, doc.filePath, doc.fileName);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.documentsService.delete(id);
    return { success: true };
  }
}
