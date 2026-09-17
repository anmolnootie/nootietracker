import { Controller, Post, Get, Delete, Param, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Request } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { DispatchReportImportService } from './dispatch-report-import.service';

@Controller('dispatch-report-import')
@UseGuards(AuthGuard('jwt'))
export class DispatchReportImportController {
  constructor(private readonly dispatchReportImportService: DispatchReportImportService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    return this.dispatchReportImportService.processFile(file.buffer, file.originalname, req.user.userId);
  }

  @Get('batches')
  listBatches() {
    return this.dispatchReportImportService.listBatches();
  }

  @Get('batches/:id')
  getBatch(@Param('id') id: string) {
    return this.dispatchReportImportService.getBatch(id);
  }

  @Get('batches/:id/rows')
  getRows(@Param('id') id: string) {
    return this.dispatchReportImportService.getRows(id);
  }

  @Delete('batches/:id')
  deleteBatch(@Param('id') id: string) {
    return this.dispatchReportImportService.deleteBatch(id);
  }
}
