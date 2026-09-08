import { Controller, Get, UseGuards, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AuthGuard('jwt'))
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  private send(res: Response, filename: string, csv: string) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('open-pos.csv')
  async openPos(@Res() res: Response) {
    this.send(res, 'open-pos.csv', await this.reportsService.openPosCsv());
  }

  @Get('expiry.csv')
  async expiry(@Res() res: Response) {
    this.send(res, 'expiry.csv', await this.reportsService.expiryCsv());
  }

  @Get('grn-ageing.csv')
  async grnAgeing(@Res() res: Response) {
    this.send(res, 'grn-ageing.csv', await this.reportsService.grnAgeingCsv());
  }

  @Get('returns.csv')
  async returns(@Res() res: Response) {
    this.send(res, 'returns.csv', await this.reportsService.returnsCsv());
  }
}
