import { Controller, Get, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExceptionsService } from './exceptions.service';
import { ExceptionResolutionStatus, ExceptionSeverity, ExceptionType } from '@po-control-tower/shared';

@Controller('exceptions')
@UseGuards(AuthGuard('jwt'))
export class ExceptionsController {
  constructor(private readonly exceptionsService: ExceptionsService) {}

  @Get()
  list(
    @Query('status') status?: ExceptionResolutionStatus,
    @Query('severity') severity?: ExceptionSeverity,
    @Query('type') type?: ExceptionType,
    @Query('batchId') batchId?: string,
    @Query('poId') poId?: string,
  ) {
    return this.exceptionsService.list({ status, severity, type, batchId, poId });
  }

  @Get(':id/detail')
  getDetail(@Param('id') id: string) {
    return this.exceptionsService.getDetail(id);
  }

  @Put(':id/resolve')
  resolve(@Param('id') id: string, @Body() body: { resolutionNotes?: string; resolutionStatus?: ExceptionResolutionStatus }) {
    return this.exceptionsService.resolve(id, body.resolutionNotes, body.resolutionStatus);
  }
}
