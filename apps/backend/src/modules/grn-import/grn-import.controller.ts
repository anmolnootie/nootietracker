import { Controller, Post, Get, Delete, Param, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Request } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { GrnImportService } from './grn-import.service';

@Controller('grn-import')
@UseGuards(AuthGuard('jwt'))
export class GrnImportController {
  constructor(private readonly grnImportService: GrnImportService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    return this.grnImportService.processFile(file.buffer, file.originalname, req.user.userId);
  }

  @Get('batches')
  listBatches() {
    return this.grnImportService.listBatches();
  }

  @Get('batches/:id')
  getBatch(@Param('id') id: string) {
    return this.grnImportService.getBatch(id);
  }

  @Get('batches/:id/rows')
  getRows(@Param('id') id: string) {
    return this.grnImportService.getRows(id);
  }

  @Delete('batches/:id')
  deleteBatch(@Param('id') id: string) {
    return this.grnImportService.deleteBatch(id);
  }
}
