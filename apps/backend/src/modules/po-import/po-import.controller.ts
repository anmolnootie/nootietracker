import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { POImportService } from './po-import.service';

@Controller('po-import')
@UseGuards(AuthGuard('jwt'))
export class POImportController {
  constructor(private readonly poImportService: POImportService) {}

  @Post('extract')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'pdf', maxCount: 1 },
      { name: 'linesFile', maxCount: 1 },
    ]),
  )
  async extract(
    @UploadedFiles() files: { pdf?: Express.Multer.File[]; linesFile?: Express.Multer.File[] },
  ) {
    const pdfFile = files?.pdf?.[0];
    if (!pdfFile) {
      throw new BadRequestException('A PDF file is required');
    }
    return this.poImportService.buildDraft(pdfFile.buffer, files?.linesFile?.[0]?.buffer);
  }

  @Post('extract-excel')
  @UseInterceptors(FileInterceptor('excel'))
  async extractExcel(
    @UploadedFile() file: Express.Multer.File,
    @Body('platform') platform?: string,
  ) {
    if (!file) {
      throw new BadRequestException('An Excel/CSV file is required');
    }
    return this.poImportService.buildDraftFromExcel(file.buffer, platform, file.originalname);
  }
}
