import { Controller, Post, Get, Delete, Param, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Request } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { DnImportService } from './dn-import.service';

@Controller('dn-import')
@UseGuards(AuthGuard('jwt'))
export class DnImportController {
  constructor(private readonly dnImportService: DnImportService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    return this.dnImportService.startFile(file.buffer, file.originalname, req.user.userId);
  }

  @Get('batches')
  listBatches() {
    return this.dnImportService.listBatches();
  }

  @Get('batches/:id')
  getBatch(@Param('id') id: string) {
    return this.dnImportService.getBatch(id);
  }

  @Get('batches/:id/rows')
  getRows(@Param('id') id: string) {
    return this.dnImportService.getRows(id);
  }

  @Delete('batches/:id')
  deleteBatch(@Param('id') id: string) {
    return this.dnImportService.deleteBatch(id);
  }
}
