import { Controller, Post, Get, Delete, Param, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Request } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { InvoiceImportService } from './invoice-import.service';

@Controller('invoice-import')
@UseGuards(AuthGuard('jwt'))
export class InvoiceImportController {
  constructor(private readonly invoiceImportService: InvoiceImportService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    return this.invoiceImportService.processFile(file.buffer, file.originalname, req.user.userId);
  }

  @Get('batches')
  listBatches() {
    return this.invoiceImportService.listBatches();
  }

  @Get('batches/:id')
  getBatch(@Param('id') id: string) {
    return this.invoiceImportService.getBatch(id);
  }

  @Get('batches/:id/rows')
  getRows(@Param('id') id: string) {
    return this.invoiceImportService.getRows(id);
  }

  @Delete('batches/:id')
  deleteBatch(@Param('id') id: string) {
    return this.invoiceImportService.deleteBatch(id);
  }
}
