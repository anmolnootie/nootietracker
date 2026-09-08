import { Controller, Get, Post, Delete, Param, Body, UseGuards, Request, Res, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { CompilationsService, CompilationFilters } from './compilations.service';
import { POReportsService } from '../bulk-import/po-reports.service';

@Controller('compilations')
@UseGuards(AuthGuard('jwt'))
export class CompilationsController {
  constructor(
    private readonly compilationsService: CompilationsService,
    private readonly poReportsService: POReportsService,
  ) {}

  @Post('preview')
  preview(@Body() filters: CompilationFilters) {
    return this.compilationsService.previewFilter(filters);
  }

  @Post()
  create(@Body() body: { name?: string; filters: CompilationFilters; poIds: string[] }, @Request() req: any) {
    return this.compilationsService.create({ ...body, userId: req.user.userId });
  }

  @Get()
  list() {
    return this.compilationsService.list();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.compilationsService.getById(id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.compilationsService.delete(id);
    return { success: true };
  }

  @Get(':id/sku-summary')
  async getSkuSummary(@Param('id') id: string) {
    const { compilation } = await this.compilationsService.getById(id);
    return this.poReportsService.getSkuSummary({ poIds: compilation.poIds });
  }

  @Get(':id/po-summary')
  async getPoSummary(@Param('id') id: string) {
    const { compilation } = await this.compilationsService.getById(id);
    return this.poReportsService.getPoSummary({ poIds: compilation.poIds });
  }

  @Get(':id/sku-summary.xlsx')
  async downloadSkuSummary(@Param('id') id: string, @Res() res: Response) {
    const { compilation } = await this.compilationsService.getById(id);
    const buffer = await this.poReportsService.buildSkuSummaryWorkbook({ poIds: compilation.poIds });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${compilation.compilationCode}-sku-summary.xlsx"`);
    res.send(buffer);
  }

  @Get(':id/po-summary.xlsx')
  async downloadPoSummary(@Param('id') id: string, @Res() res: Response) {
    const { compilation } = await this.compilationsService.getById(id);
    const buffer = await this.poReportsService.buildPoSummaryWorkbook({ poIds: compilation.poIds });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${compilation.compilationCode}-po-summary.xlsx"`);
    res.send(buffer);
  }
}
