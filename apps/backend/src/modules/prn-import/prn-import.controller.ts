import { Controller, Post, Get, Delete, Param, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Request } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { PrnImportService } from './prn-import.service';

@Controller('prn-import')
@UseGuards(AuthGuard('jwt'))
export class PrnImportController {
  constructor(private readonly prnImportService: PrnImportService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    return this.prnImportService.startFile(file.buffer, file.originalname, req.user.userId);
  }

  @Get('batches')
  listBatches() {
    return this.prnImportService.listBatches();
  }

  @Get('batches/:id')
  getBatch(@Param('id') id: string) {
    return this.prnImportService.getBatch(id);
  }

  @Get('batches/:id/rows')
  getRows(@Param('id') id: string) {
    return this.prnImportService.getRows(id);
  }

  @Delete('batches/:id')
  deleteBatch(@Param('id') id: string) {
    return this.prnImportService.deleteBatch(id);
  }
}
