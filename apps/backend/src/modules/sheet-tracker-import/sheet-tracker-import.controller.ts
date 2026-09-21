import { Controller, Post, Get, Delete, Param, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Request } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { SheetTrackerImportService } from './sheet-tracker-import.service';

@Controller('sheet-tracker-import')
@UseGuards(AuthGuard('jwt'))
export class SheetTrackerImportController {
  constructor(private readonly service: SheetTrackerImportService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) throw new BadRequestException('A file is required');
    return this.service.processFile(file.buffer, file.originalname, req.user.userId);
  }

  @Get('batches')
  listBatches() {
    return this.service.listBatches();
  }

  @Get('batches/:id')
  getBatch(@Param('id') id: string) {
    return this.service.getBatch(id);
  }

  @Get('batches/:id/rows')
  getRows(@Param('id') id: string) {
    return this.service.getRows(id);
  }

  @Delete('batches/:id')
  deleteBatch(@Param('id') id: string) {
    return this.service.deleteBatch(id);
  }
}
