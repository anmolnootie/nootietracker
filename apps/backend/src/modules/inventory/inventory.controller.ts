import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { InventoryService, CreateSkuMasterInput, UpdateSkuMasterInput } from './inventory.service';

@Controller('inventory')
@UseGuards(AuthGuard('jwt'))
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    return this.inventoryService.uploadSkuFile(file.buffer, file.originalname);
  }

  @Get('dashboard')
  getDashboard() {
    return this.inventoryService.getDashboard();
  }

  @Get('sku-master')
  list(@Query('search') search?: string) {
    return this.inventoryService.list(search);
  }

  @Post('sku-master')
  create(@Body() body: CreateSkuMasterInput) {
    if (!body.skuCode || !body.skuName) {
      throw new BadRequestException('skuCode and skuName are required');
    }
    return this.inventoryService.create(body);
  }

  @Patch('sku-master/:id')
  update(@Param('id') id: string, @Body() body: UpdateSkuMasterInput) {
    return this.inventoryService.update(id, body);
  }

  @Delete('sku-master/:id')
  remove(@Param('id') id: string) {
    return this.inventoryService.remove(id);
  }
}
