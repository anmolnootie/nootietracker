import { BadRequestException, Controller, Get, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@po-control-tower/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WarehouseMasterService } from './warehouse-master.service';

/** Warehouse Master import: upload the workbook (ADMIN/SCM); anyone signed in can read the last result. */
@Controller('warehouse-master')
@UseGuards(AuthGuard('jwt'))
export class WarehouseMasterController {
  constructor(private readonly service: WarehouseMasterService) {}

  @Get('status')
  status() {
    return this.service.status();
  }

  @Post('upload')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SCM)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 40 * 1024 * 1024 } }))
  upload(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) throw new BadRequestException('Attach the Warehouse Master Excel file');
    return this.service.start(file.buffer, file.originalname, req.user.userId);
  }
}
