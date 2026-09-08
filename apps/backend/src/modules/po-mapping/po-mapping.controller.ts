import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { POMappingStatus } from '@po-control-tower/shared';
import { POMappingService, UpdatePOMappingInput, MapWholePOInput } from './po-mapping.service';

@Controller('po-mapping')
@UseGuards(AuthGuard('jwt'))
export class POMappingController {
  constructor(private readonly poMappingService: POMappingService) {}

  @Post('whole-po')
  mapWholePO(@Body() body: Omit<MapWholePOInput, 'createdByUserId'>, @Request() req: any) {
    return this.poMappingService.mapWholePO({ ...body, createdByUserId: req.user.userId });
  }

  @Post('auto-map-whole-po')
  autoMapWholePO(
    @Body() body: { originalPoId: string; reason?: string; remarks?: string; newAppointmentDate?: string },
    @Request() req: any,
  ) {
    return this.poMappingService.autoMapWholePO({ ...body, createdByUserId: req.user.userId });
  }

  @Get()
  list(@Query('originalPoId') originalPoId?: string, @Query('newPoId') newPoId?: string, @Query('status') status?: POMappingStatus) {
    return this.poMappingService.list({ originalPoId, newPoId, status });
  }

  @Get('for-stuck-stock')
  listForOriginal(@Query('originalPoId') originalPoId: string, @Query('skuCode') skuCode: string) {
    return this.poMappingService.listForOriginal(originalPoId, skuCode);
  }

  @Get('for-new-po')
  getMappedStockForNewPo(@Query('newPoId') newPoId: string) {
    return this.poMappingService.getMappedStockForNewPo(newPoId);
  }

  @Get('batch')
  listBatch(@Query('originalPoId') originalPoId: string, @Query('newPoId') newPoId: string, @Query('mappingDate') mappingDate: string) {
    return this.poMappingService.listBatch(originalPoId, newPoId, mappingDate);
  }

  @Patch('batch')
  updateBatch(
    @Query('originalPoId') originalPoId: string,
    @Query('newPoId') newPoId: string,
    @Query('mappingDate') mappingDate: string,
    @Body() body: UpdatePOMappingInput,
  ) {
    return this.poMappingService.updateBatch(originalPoId, newPoId, mappingDate, body);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.poMappingService.getById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdatePOMappingInput) {
    return this.poMappingService.update(id, body);
  }
}
