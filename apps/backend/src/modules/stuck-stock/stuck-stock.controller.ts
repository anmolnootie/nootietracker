import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { StuckStockStatus, StuckStockReason } from '@po-control-tower/shared';
import { StuckStockService } from './stuck-stock.service';

@Controller('stuck-stock')
@UseGuards(AuthGuard('jwt'))
export class StuckStockController {
  constructor(private readonly stuckStockService: StuckStockService) {}

  @Post('detect')
  detect() {
    return this.stuckStockService.detect();
  }

  @Get()
  list(@Query('status') status?: StuckStockStatus, @Query('reason') reason?: StuckStockReason, @Query('warehouse') warehouse?: string) {
    return this.stuckStockService.list({ status, reason, warehouse });
  }

  @Get('summary')
  getSummary() {
    return this.stuckStockService.getSummary();
  }

  @Get('by-po')
  listGroupedByPO() {
    return this.stuckStockService.listGroupedByPO();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.stuckStockService.getById(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { ownerId?: string | null; remarks?: string | null; status?: StuckStockStatus.RESOLVED | StuckStockStatus.WRITTEN_OFF | StuckStockStatus.OPEN },
  ) {
    return this.stuckStockService.update(id, body);
  }
}
