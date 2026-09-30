import { Controller, Get, Post, Put, Param, Body, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { ReturnsService } from './returns.service';

@Controller('returns')
@UseGuards(AuthGuard('jwt'))
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  async list() {
    return this.returnsService.list();
  }

  // Declared before ':id/close' so these two never get read as an :id.
  @Get('expired-undelivered')
  async getExpiredUndelivered() {
    return this.returnsService.getExpiredUndeliveredDashboard();
  }

  @Get('expired-undelivered/export.xlsx')
  async downloadExpiredUndelivered(@Res() res: Response) {
    const buffer = await this.returnsService.buildExpiredUndeliveredWorkbook();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="expired-dispatched-not-delivered.xlsx"');
    res.send(buffer);
  }

  @Post(':poId')
  async create(
    @Param('poId') poId: string,
    @Body() body: { returnType: 'RECALL_NOT_DELIVERED' | 'REJECTED_GRN' | 'DAMAGE' | 'SHORTAGE'; rootCause?: string; lossAmount?: number },
  ) {
    return this.returnsService.create(poId, body);
  }

  @Put(':id/close')
  async close(
    @Param('id') id: string,
    @Body() body: { rootCause: string; creditNoteNumber?: string; lossAmount?: number; dncnType?: 'DEBIT' | 'CREDIT'; dncnValue?: number },
  ) {
    return this.returnsService.close(id, body);
  }
}
